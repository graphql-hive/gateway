import {
  defineConfig,
  GatewayPlugin,
  SEMRESATTRS_SERVICE_NAME,
} from '@graphql-hive/gateway';
import { AsyncLocalStorageContextManager } from '@graphql-mesh/plugin-opentelemetry/async-context-manager';
import { opentelemetrySetup } from '@graphql-mesh/plugin-opentelemetry/setup';
import type { MeshFetchRequestInit } from '@graphql-mesh/types';
import { trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';

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

const exporterModule =
  process.env['OTLP_EXPORTER_TYPE'] === 'http'
    ? await import(`@opentelemetry/exporter-trace-otlp-http`)
    : await import(`@opentelemetry/exporter-trace-otlp-grpc`);

const OTLPTraceExporter =
  exporterModule.OTLPTraceExporter ?? exporterModule.default.OTLPTraceExporter;

opentelemetrySetup({
  contextManager: new AsyncLocalStorageContextManager(),
  resource: resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: process.env['OTLP_SERVICE_NAME'],
  }),
  traces: {
    exporter: new OTLPTraceExporter({ url: process.env['OTLP_EXPORTER_URL'] }),
    batching: { maxExportBatchSize: 1, scheduledDelayMillis: 1 },
  },
});

export const gatewayConfig = defineConfig({
  openTelemetry: {
    traces: true,
  },
  plugins: () => [
    {
      onExecute() {
        trace.getActiveSpan()?.setAttribute('custom.attribute', 'custom value');
      },
    },
    ...(process.env['MEMTEST']
      ? [
          // disable the plugin in memtests because the upstreamCallHeaders will grew forever reporting a false positive leak
        ]
      : [useOnFetchTracer()]),
  ],
});
