import {
  createOtlpGrpcExporter,
  createOtlpHttpExporter,
  defineConfig,
  GatewayPlugin,
  OpenTelemetryDiagLogLevel,
} from '@graphql-hive/gateway';
import type { MeshFetchRequestInit } from '@graphql-mesh/types';

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

export const gatewayConfig = defineConfig({
  openTelemetry: {
    diagLevel: OpenTelemetryDiagLogLevel.INFO,
    exporters: [
      process.env['OTLP_EXPORTER_TYPE'] === 'grpc'
        ? createOtlpGrpcExporter(
            {
              url: process.env['OTLP_EXPORTER_URL'],
            },
            // Batching config is set in order to make it easier to test.
            {
              maxExportBatchSize: 1,
              scheduledDelayMillis: 1,
            },
          )
        : createOtlpHttpExporter(
            {
              url: process.env['OTLP_EXPORTER_URL'],
            },
            // Batching config is set in order to make it easier to test.
            {
              maxExportBatchSize: 1,
              scheduledDelayMillis: 1,
            },
          ),
    ],
    serviceName: process.env['OTLP_SERVICE_NAME'],
  },
  plugins: () =>
    process.env['MEMTEST']
      ? [
          // disable the plugin in memtests because the upstreamCallHeaders will grew forever reporting a false positive leak
        ]
      : [useOnFetchTracer()],
});
