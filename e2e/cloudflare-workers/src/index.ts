import { ExportedHandler, Response } from '@cloudflare/workers-types';
import {
  createGatewayRuntime,
  GatewayPlugin,
} from '@graphql-hive/gateway-runtime';
import {
  SEMRESATTRS_SERVICE_NAME,
  useOpenTelemetry,
} from '@graphql-mesh/plugin-opentelemetry';
import http from '@graphql-mesh/transport-http';
import { diag } from '@opentelemetry/api';
import { setGlobalErrorHandler } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

interface Env {
  OTLP_EXPORTER_URL: string;
  OTLP_SERVICE_NAME: string;
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
    setGlobalErrorHandler((err) => diag.error('Uncaught Error', err));

    new WebTracerProvider({
      resource: resourceFromAttributes({
        [SEMRESATTRS_SERVICE_NAME]: env.OTLP_SERVICE_NAME,
      }),
      spanProcessors: [
        // Do not batch for test
        new SimpleSpanProcessor(
          new OTLPTraceExporter({
            url: env.OTLP_EXPORTER_URL,
          }),
        ),
      ],
    }).register();

    console.log(env);
    runtime = createGatewayRuntime({
      proxy: { endpoint: 'https://countries.trevorblades.com' },
      transports: { http },
      plugins: (ctx) => [
        useOpenTelemetry({
          ...ctx,
          traces: true,
        }),
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
