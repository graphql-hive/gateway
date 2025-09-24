import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';
import { trace } from '@graphql-hive/gateway/opentelemetry/api';
import { openTelemetrySetup } from '@graphql-hive/gateway/opentelemetry/setup';
import type { MeshFetchRequestInit } from '@graphql-mesh/types';
import {
  getNodeAutoInstrumentations,
  getResourceDetectors,
} from '@opentelemetry/auto-instrumentations-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
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

if (process.env['DISABLE_OPENTELEMETRY_SETUP'] !== '1') {
  const { OTLPTraceExporter } =
    process.env['OTLP_EXPORTER_TYPE'] === 'http'
      ? await import(`@opentelemetry/exporter-trace-otlp-http`)
      : await import(`@opentelemetry/exporter-trace-otlp-grpc`);

  const exporter = new OTLPTraceExporter({
    url: process.env['OTLP_EXPORTER_URL'],
  });

  const resource = resources.resourceFromAttributes({
    'custom.resource': 'custom value',
  });

  // The NodeSDK only actually work in Node. For other envs, it's better to use our own configurator
  if (
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.node &&
    typeof Bun === 'undefined' // Bun also has process.versions.node
  ) {
    const sdk = new NodeSDK({
      // Use spanProcessor instead of spanExporter to remove batching for test speed
      spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
      resource,
      instrumentations: getNodeAutoInstrumentations(),
      resourceDetectors: getResourceDetectors(),
    });

    sdk.start();
    ['SIGTERM', 'SIGINT'].forEach((sig) =>
      process.on(sig, () => sdk.shutdown()),
    );
  } else {
    openTelemetrySetup({
      contextManager: new AsyncLocalStorageContextManager(),
      resource,
      traces: {
        exporter,
        // Disable batching to speedup tests
        batching: false,
      },
    });
  }
}

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
