import { Context } from '@opentelemetry/api';
import { hrTimeDuration } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  BatchSpanProcessor,
  BufferConfig,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { SpanImpl } from '@opentelemetry/sdk-trace-base/build/src/Span';
import { SEMATTRS_HTTP_METHOD } from '@opentelemetry/semantic-conventions';
import {
  SEMATTRS_HIVE_GATEWAY_OPERATION_SUBGRAPH_NAMES,
  SEMATTRS_HIVE_GRAPHQL_ERROR_CODES,
  SEMATTRS_HIVE_GRAPHQL_ERROR_COUNT,
} from './attributes';

export type HiveTracingSpanProcessorOptions =
  | {
      target: string;
      accessToken: string;
      endpoint: string;
      batching?: BufferConfig;
      processor?: never;
    }
  | {
      processor: SpanProcessor;
    };

type TraceState = {
  traceId: string;
  rootId: string;
  operationRoots: Map<string, SpanImpl>;
  subgraphExecutions: Map<string, SpanImpl>;
  httpSpan: SpanImpl;
};

export class HiveTracingSpanProcessor implements SpanProcessor {
  private traceStateById: Map<string, TraceState> = new Map();
  private processor: SpanProcessor;

  constructor(config: HiveTracingSpanProcessorOptions) {
    if (config.processor) {
      this.processor = config.processor;
    } else {
      this.processor = new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: config.endpoint,
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'X-Hive-Target-Ref': config.target,
          },
        }),
        config.batching,
      );
    }
  }

  onStart(span: Span, parentContext: Context): void {
    this.processor.onStart(span, parentContext);
    const { spanId, traceId } = span.spanContext();
    const parentId = span.parentSpanContext?.spanId;

    if (isHttpSpan(span)) {
      this.traceStateById.set(traceId, {
        traceId,
        rootId: spanId,
        httpSpan: span as SpanImpl,
        operationRoots: new Map(),
        subgraphExecutions: new Map(),
      });
      return;
    }

    const traceState = this.traceStateById.get(traceId);
    if (!traceState || !parentId) {
      // This is not an HTTP trace, ignore it
      return;
    }

    if (isOperationSpan(span)) {
      span.setAttribute('hive.graphql', true)
      traceState?.operationRoots.set(spanId, span as SpanImpl);
      return;
    }

    const operationRoot = traceState.operationRoots.get(parentId);
    if (operationRoot) {
      // Set the root for children
      traceState.operationRoots.set(spanId, operationRoot);
    }

    if (span.name.startsWith('subgraph.execute')) {
      traceState.subgraphExecutions.set(spanId, span as SpanImpl);
      return;
    }

    const subgraphExecution = traceState.subgraphExecutions.get(parentId);
    if (subgraphExecution) {
      // Set the root for children
      traceState.subgraphExecutions.set(spanId, subgraphExecution);
    }
  }

  onEnd(span: Span): void {
    const { traceId, spanId } = span.spanContext();
    const traceState = this.traceStateById.get(traceId);

    if (!traceState) {
      // Skip, this is not an HTTP trace
      return;
    }

    if (traceState.rootId === spanId) {
      // Clean up trace state early to avoid any memory leak in case of error thrown
      this.traceStateById.delete(traceId);

      for (let operationSpan of new Set(traceState.operationRoots.values())) {
        // @ts-expect-error set the start time to the HTTP start time, so that operation span replaces http span
        operationSpan.startTime = span.startTime;
        operationSpan.endTime = span.endTime;
        // @ts-expect-error set the duration time
        operationSpan._duration = hrTimeDuration(
          operationSpan.startTime,
          operationSpan.endTime,
        );
        // @ts-expect-error Remove the parenting, so that this span appears as a root span for Hive
        operationSpan.parentSpanContext = null;

        // Copy HTTP attributes
        for (const attr in span.attributes) {
          operationSpan.attributes[attr] ??= span.attributes[attr];
        }

        // Now that operation spans have been updated, we can report it
        this.processor.onEnd(operationSpan);
      }

      // This is the HTTP, don't report it, we report only the graphql operation
      return;
    }

    const operationSpan = traceState.operationRoots.get(spanId);
    if (!operationSpan) {
      // If the operation span is not found, it is probably not related to any request (init, schema loading...).
      return;
    }

    if (operationSpan === span) {
      // It is an operation span, we don't want to report it yet,
      // it has to be updated at HTTP end time.
      return;
    }

    if (SPANS_WITH_ERRORS.includes(span.name)) {
      copyAttribute(span, operationSpan, SEMATTRS_HIVE_GRAPHQL_ERROR_CODES);
      copyAttribute(span, operationSpan, SEMATTRS_HIVE_GRAPHQL_ERROR_COUNT);
    }

    if (span.name === 'graphql.execute') {
      copyAttribute(
        span,
        operationSpan,
        SEMATTRS_HIVE_GATEWAY_OPERATION_SUBGRAPH_NAMES,
      );
    }

    const subgraphExecution = traceState.subgraphExecutions.get(spanId);
    if (span.name === 'http.fetch' && subgraphExecution) {
      for (const attr in span.attributes) {
        subgraphExecution.attributes[attr] ??= span.attributes[attr];
      }
    }

    // Report all spans that belongs to an operation span
    this.processor.onEnd(span);
  }

  async forceFlush(): Promise<void> {
    return this.processor.forceFlush();
  }

  async shutdown(): Promise<void> {
    // Clean up resources when shutting down
    await this.forceFlush();
    this.traceStateById.clear();
    return this.processor.shutdown();
  }
}

function isHttpSpan(span: Span): boolean {
  return !!span.attributes[SEMATTRS_HTTP_METHOD];
}

function copyAttribute(
  source: Span,
  target: Span,
  sourceAttrName: string,
  targetAttrName: string = sourceAttrName,
) {
  target.attributes[targetAttrName] = source.attributes[sourceAttrName];
}

function isOperationSpan(span: Span): boolean {
  if (!span.name.startsWith('graphql.operation')) {
    return false;
  }
  const followingChar = span.name.at(17);
  return !followingChar || followingChar === ' ';
}

const SPANS_WITH_ERRORS = [
  'graphql.parse',
  'graphql.validate',
  'graphql.execute',
];
