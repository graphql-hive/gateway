import { ExportedHandler, Response } from '@cloudflare/workers-types';
import {
  createGatewayRuntime,
  GatewayPlugin,
} from '@graphql-hive/gateway-runtime';
import { useOpenTelemetry } from '@graphql-mesh/plugin-opentelemetry';
import { opentelemetrySetup } from '@graphql-mesh/plugin-opentelemetry/setup';
import http from '@graphql-mesh/transport-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

interface Env {
  OTLP_EXPORTER_URL: string;
  OTEL_SERVICE_NAME: string;
  DEBUG: string;
}

const upstreamCallHeaders: Array<{
  url: string;
  headers?: HeadersInit;
}> = [];

// The following plugin is used to trace the fetch calls made by Mesh.
const useOnFetchTracer = (): GatewayPlugin => {
  return {
    onFetch({ url, options }) {
      upstreamCallHeaders.push({ url, headers: options.headers });
    },
    onRequest({ request, endResponse, fetchAPI }) {
      if (request.url.includes('upstream-fetch') && request.method === 'GET') {
        endResponse(fetchAPI.Response.json(upstreamCallHeaders));
        return;
      }
    },
  };
};

let runtime: ReturnType<typeof createGatewayRuntime>;
function getRuntime(env: Env) {
  if (!runtime) {
    opentelemetrySetup({
      contextManager: null,
      resource: { serviceName: env.OTEL_SERVICE_NAME, serviceVersion: '1.0.0' },
      traces: {
        exporter: new OTLPTraceExporter({ url: env['OTLP_EXPORTER_URL'] }),
        batching: false, // Disable batching to speedup tests
      },
    });

    runtime = createGatewayRuntime({
      proxy: { endpoint: 'https://countries.trevorblades.com' },
      transports: { http },
      plugins: (ctx) => [
        useOpenTelemetry({ ...ctx, traces: true }),
        useOnFetchTracer(),
      ],
    });
  }
  return runtime;
}

export default {
  async fetch(req, env, ctx) {
    const res = await getRuntime(env)(req, env, ctx);
    return res as unknown as Response;
  },
} satisfies ExportedHandler<Env>;
