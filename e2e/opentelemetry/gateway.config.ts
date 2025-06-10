import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';
import type { MeshFetchRequestInit } from '@graphql-mesh/types';
import { trace } from '@opentelemetry/api';
import {
  getNodeAutoInstrumentations,
  getResourceDetectors,
} from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK, resources, tracing } from '@opentelemetry/sdk-node';

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

const { OTLPTraceExporter } =
  process.env['OTLP_EXPORTER_TYPE'] === 'http'
    ? await import(`@opentelemetry/exporter-trace-otlp-http`)
    : await import(`@opentelemetry/exporter-trace-otlp-grpc`);

const sdk = new NodeSDK({
  // Use spanProcessor instead of spanExporter to remove batching for test speed
  spanProcessors: [
    new tracing.SimpleSpanProcessor(
      new OTLPTraceExporter({ url: process.env['OTLP_EXPORTER_URL'] }),
    ),
  ],
  resource: resources.resourceFromAttributes({
    'custom.resource': 'custom value',
  }),
  instrumentations: getNodeAutoInstrumentations(),
  resourceDetectors: getResourceDetectors(),
});

sdk.start();
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => sdk.shutdown()));

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
