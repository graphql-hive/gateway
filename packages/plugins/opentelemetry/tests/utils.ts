import {
  GatewayConfigContext,
  GatewayConfigProxy,
  GatewayPlugin,
} from '@graphql-hive/gateway';
import { MeshFetch } from '@graphql-mesh/types';
import {
  context,
  diag,
  metrics,
  propagation,
  ProxyTracerProvider,
  trace,
  TraceState,
  type TextMapPropagator,
} from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
  type TracerConfig,
} from '@opentelemetry/sdk-trace-base';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { createSchema, createYoga, type GraphQLParams } from 'graphql-yoga';
import { expect } from 'vitest';
import { hive } from '../src/api';
import type { OpenTelemetryGatewayPluginOptions } from '../src/plugin';

export async function buildTestGateway(
  options: {
    gatewayOptions?: Omit<GatewayConfigProxy, 'proxy'>;
    options?: OpenTelemetryGatewayPluginOptions;
    plugins?: (
      ctx: GatewayConfigContext,
    ) => GatewayPlugin<OpenTelemetryGatewayPluginOptions>[];
    fetch?: (upstreamFetch: MeshFetch) => MeshFetch;
  } = {},
) {
  const gw = await import('../../../runtime/src');
  const { useOpenTelemetry } = await import('../src');
  const stack = new AsyncDisposableStack();

  const upstream = stack.use(
    createYoga({
      schema: createSchema({
        typeDefs: /* GraphQL */ `
          type Query {
            hello: String
          }
        `,
        resolvers: {
          Query: {
            hello: () => 'World',
          },
        },
      }),
      logging: false,
    }),
  );

  // Disable hive utils API to allow the new instance to replace it
  hive.disable();

  const gateway = stack.use(
    gw.createGatewayRuntime({
      proxy: {
        endpoint: 'https://example.com/graphql',
      },
      maskedErrors: false,
      plugins: (ctx) => {
        return [
          gw.useCustomFetch(
            // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
            options.fetch ? options.fetch(upstream.fetch) : upstream.fetch,
          ),
          useOpenTelemetry({
            ...ctx,
            ...options.options,
          }),
          ...(options.plugins?.(ctx) ?? []),
        ];
      },
      logging: true,
      ...options.gatewayOptions,
    }),
  );

  return {
    query: async ({
      shouldReturnErrors,
      body = {
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      },
      headers,
    }: {
      body?: GraphQLParams;
      shouldReturnErrors?: boolean;
      headers?: Record<string, string>;
    } = {}) => {
      const response = await gateway.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      if (shouldReturnErrors) {
        expect(result.errors).toBeDefined();
      } else {
        if (result.errors) {
          console.error(result.errors);
        }
        expect(result.errors).not.toBeDefined();
      }
      return result;
    },
    fetch: gateway.fetch,
    [Symbol.asyncDispose]: () => {
      diag.disable();
      return stack.disposeAsync();
    },
  };
}

export class MockSpanExporter implements SpanExporter {
  spans: Span[] = [];

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    this.spans.push(
      ...spans.map((span) => ({
        ...span,
        traceId: span.spanContext().traceId,
        traceState: span.spanContext().traceState,
        id: span.spanContext().spanId,
      })),
    );
    setTimeout(() => resultCallback({ code: ExportResultCode.SUCCESS }), 0);
  }
  shutdown() {
    this.reset();
    return Promise.resolve();
  }
  forceFlush() {
    this.reset();
    return Promise.resolve();
  }
  reset() {
    this.spans = [];
  }

  buildSpanNode = (span: Span): TraceTreeNode =>
    new TraceTreeNode(
      span,
      this.spans
        .filter(
          ({ parentSpanContext }) => parentSpanContext?.spanId === span.id,
        )
        .map(this.buildSpanNode),
    );

  assertRoot(rootName: string): TraceTreeNode {
    const root = this.spans.find(({ name }) => name === rootName);
    if (!root) {
      console.error(
        `failed to find "${rootName}". Spans are: `,
        this.toString(),
      );
      throw new Error(
        `No root span found with name '${rootName}'. Span names are: ${this.toString()}`,
      );
    }
    return this.buildSpanNode(root);
  }

  assertNoSpanWithName = (name: string) => {
    expect(this.spans.map(({ name }) => name)).not.toContain(name);
  };

  assertSpanWithName = (name: string) => {
    const span = this.spans.find((span) => span.name === name);
    expect(span).toBeDefined();
    return span!;
  };

  toString() {
    return this.spans.map((span) => span.name);
  }
}

export class TraceTreeNode {
  constructor(
    public span: Span,
    public children: TraceTreeNode[],
  ) {}

  expectChild = (name: string): TraceTreeNode => {
    const child = this.children.find((child) => child.span.name === name);
    if (!child) {
      console.error(`No child span with name "${name}" in:\n`, this.toString());
      throw new Error(
        `No child span found with name '${name}'. Children names are: ${this.children.map((child) => `\n\t- ${child.span.name}`)}`,
      );
    }
    return child;
  };

  get length() {
    return this.children.length;
  }

  get descendants(): Span[] {
    return [this.span, ...this.children.flatMap((c) => c.descendants)];
  }

  toString(prefix = '') {
    return `${prefix}-- ${this.span.name}\n${this.children.map((c): string => c.toString(prefix + '  |')).join('')}`;
  }
}

export type Span = ReadableSpan & {
  traceId: string;
  traceState?: TraceState;
  id: string;
};

export const spanExporter = new MockSpanExporter();
const traceProvider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spanExporter)],
});

export function setupOtelForTests({
  contextManager,
}: {
  contextManager?: boolean;
} = {}) {
  trace.setGlobalTracerProvider(traceProvider);
  if (contextManager !== false) {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager());
  }
}

export const getContextManager = () => {
  // @ts-expect-error Access to private method for test purpose
  return context._getContextManager() as Context;
};

export const getTracerProvider = () => {
  return (trace.getTracerProvider() as ProxyTracerProvider).getDelegate();
};

export const getPropagator = () => {
  // @ts-expect-error Access to private method for test purpose
  return propagation._getGlobalPropagator() as TextMapPropagator;
};

export const getTracerProviderConfig = () => {
  return (
    // @ts-expect-error Access to private method for test purpose
    (getTracerProvider() as BasicTracerProvider)._config as TracerConfig
  );
};

export const getSampler = () => {
  return getTracerProviderConfig().sampler;
};

export const getSpanProcessors = () => {
  return getTracerProviderConfig().spanProcessors;
};

export const getResource = () => {
  return getTracerProviderConfig().resource;
};

export const getLimits = () => {
  const { spanLimits, generalLimits } = getTracerProviderConfig();
  return { spanLimits, generalLimits };
};

export const disableAll = () => {
  trace.disable();
  context.disable();
  propagation.disable();
  metrics.disable();
  diag.disable();
  logs.disable();
  hive.disable();
};

export class MockLogRecordExporter implements LogRecordExporter {
  records: LogRecord[] = [];

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    this.records.push(
      ...logs.map((record) => ({
        ...record,
        traceId: record.spanContext?.traceId,
        spanId: record.spanContext?.spanId,
      })),
    );
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    this.reset();
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    this.reset();
    return Promise.resolve();
  }

  reset() {
    this.records = [];
  }

  getLogsForSpan(spanId: string) {
    return this.records.filter((record) => record.spanId === spanId);
  }

  getLogsForTrace(traceId: string) {
    return this.records.filter((record) => record.traceId === traceId);
  }
}

export type LogRecord = ReadableLogRecord & {
  traceId?: string;
  spanId?: string;
};
