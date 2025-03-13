import {
  createOtlpGrpcExporter,
  createOtlpHttpExporter,
  defineConfig,
  GatewayPlugin,
} from '@graphql-hive/gateway';
import type { MeshFetchRequestInit } from '@graphql-mesh/types';
import {
  BatchSpanProcessor,
  ReadableSpan,
  Span,
  SpanExporter,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

// The following plugin is used to trace the fetch calls made by Mesh.
const useOnFetchTracer = (): GatewayPlugin => {
  const upstreamCallHeaders: Array<{
    url: string;
    headers: MeshFetchRequestInit['headers'];
  }> = [];

  return {
    onFetch({ url, options }) {
      upstreamCallHeaders.push({ url, headers: options.headers });
    },
    onRequest({ request, url, endResponse, fetchAPI }) {
      if (url.pathname === '/upstream-fetch' && request.method === 'GET') {
        endResponse(fetchAPI.Response.json(upstreamCallHeaders));
        return;
      }
    },
  };
};

class HiveTracingSpanProcessor implements SpanProcessor {
  private activeSpans: Map<string, Map<string, Span>> = new Map();
  private rootSpanIds: Map<string, string> = new Map();
  private subgraphNames: Map<string, Set<string>> = new Map();

  onStart(span: Span): void {
    const spanContext = span.spanContext();
    const traceId = spanContext.traceId;
    const spanId = spanContext.spanId;

    // Initialize trace data structures if needed
    if (!this.activeSpans.has(traceId)) {
      this.activeSpans.set(traceId, new Map());
    }
    if (!this.subgraphNames.has(traceId)) {
      this.subgraphNames.set(traceId, new Set());
    }

    this.activeSpans.get(traceId)!.set(spanId, span);

    // If this is a root span (no parent), mark it as the root span for this trace
    if (!span.parentSpanId) {
      this.rootSpanIds.set(traceId, spanId);
    }

    // Check if this is a subgraph execution span
    if (span.name && span.name.startsWith('subgraph.execute')) {
      const subgraphName = span.attributes['gateway.upstream.subgraph.name'];
      if (subgraphName && typeof subgraphName === 'string') {
        this.subgraphNames.get(traceId)!.add(subgraphName);
      }
    }
  }

  onEnd(span: Span): void {
    const spanContext = span.spanContext();
    const traceId = spanContext.traceId;
    const spanId = spanContext.spanId;

    // Skip if we don't have this trace
    if (!this.activeSpans.has(traceId)) {
      return;
    }

    const spansForTrace = this.activeSpans.get(traceId)!;
    const rootSpanId = this.rootSpanIds.get(traceId);
    const subgraphNamesForTrace = this.subgraphNames.get(traceId);

    // Check if this is the GraphQL execute span we're interested in
    // TODO: can we have this fully type safe?
    if (span.name === 'graphql.execute') {
      const operationType = span.attributes['graphql.operation.type'];
      const operationName = span.attributes['graphql.operation.name'];
      const errorCount = span.attributes['graphql.error.count'];

      if (rootSpanId) {
        const rootSpan = spansForTrace.get(rootSpanId);
        if (rootSpan && !rootSpan.ended) {
          // Update the name of the root span
          if (operationType && operationName) {
            rootSpan.updateName(`${operationType} ${operationName}`);

            // Copy attributes to root span
            if (operationType)
              rootSpan.setAttribute('graphql.operation.type', operationType);
            if (operationName)
              rootSpan.setAttribute('graphql.operation.name', operationName);
            if (errorCount !== undefined)
              rootSpan.setAttribute('graphql.error.count', errorCount);

            // Add the subgraph names as a comma-separated list
            if (subgraphNamesForTrace && subgraphNamesForTrace.size > 0) {
              rootSpan.setAttribute(
                'subgraph.names',
                Array.from(subgraphNamesForTrace).join(','),
              );
            }
          }
        }
      }
    }

    // For any subgraph span that's ending, make sure we capture its name
    if (span.name && span.name.startsWith('subgraph.execute')) {
      const subgraphName = span.attributes['gateway.upstream.subgraph.name'];
      if (
        subgraphName &&
        typeof subgraphName === 'string' &&
        subgraphNamesForTrace
      ) {
        subgraphNamesForTrace.add(subgraphName);

        // Update root span with current list of subgraph names
        if (rootSpanId) {
          const rootSpan = spansForTrace.get(rootSpanId);
          if (rootSpan && !rootSpan.ended) {
            rootSpan.setAttribute(
              'subgraph.names',
              Array.from(subgraphNamesForTrace).join(','),
            );
          }
        }
      }
    }

    // Clean up the span reference
    spansForTrace.delete(spanId);

    // If this is the root span or if no spans remain, clean up the trace
    if (rootSpanId === spanId || spansForTrace.size === 0) {
      this.activeSpans.delete(traceId);
      this.rootSpanIds.delete(traceId);
      this.subgraphNames.delete(traceId);
    }
  }

  async forceFlush(): Promise<void> {
    // Clear all processor state
    this.activeSpans.clear();
    this.rootSpanIds.clear();
    this.subgraphNames.clear();
  }

  async shutdown(): Promise<void> {
    // Clean up resources when shutting down
    await this.forceFlush();
  }
}
async function createHiveTracingSpanProcessor(): Promise<HiveTracingSpanProcessor> {
  return new HiveTracingSpanProcessor();
}

export const gatewayConfig = defineConfig({
  openTelemetry: {
    exporters: [
      createHiveTracingSpanProcessor(),
      process.env['OTLP_EXPORTER_TYPE'] === 'grpc'
        ? createOtlpGrpcExporter(
            {
              url: process.env['OTLP_EXPORTER_URL'],
            },
            // Batching config is set in order to make it easier to test.
            {
              scheduledDelayMillis: 1,
            },
          )
        : createOtlpHttpExporter(
            {
              url: process.env['OTLP_EXPORTER_URL'],
            },
            // Batching config is set in order to make it easier to test.
            {
              scheduledDelayMillis: 1,
            },
          ),
    ],
    serviceName: process.env['OTLP_SERVICE_NAME'],
  },
  plugins: () => [useOnFetchTracer()],
});
