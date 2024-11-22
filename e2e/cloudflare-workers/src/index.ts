import { ExportedHandler, Response } from '@cloudflare/workers-types';
import {
  createGatewayRuntime,
  DisposableSymbols,
  GatewayPlugin,
} from '@graphql-hive/gateway-runtime';
import {
  createOtlpHttpExporter,
  useOpenTelemetry,
} from '@graphql-mesh/plugin-opentelemetry';
import http from '@graphql-mesh/transport-http';
import { fakePromise } from '@graphql-tools/utils';

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

export default {
  async fetch(req, env, ctx) {
    const runtime = createGatewayRuntime({
      proxy: {
        endpoint: 'https://countries.trevorblades.com',
      },
      transports: {
        http,
      },
      plugins: (ctx) => [
        useOpenTelemetry({
          ...ctx,
          exporters: [
            createOtlpHttpExporter(
              {
                url: env['OTLP_EXPORTER_URL'],
              },
              // Batching config is set in order to make it easier to test.
              {
                scheduledDelayMillis: 1,
              },
            ),
          ],
          serviceName: env['OTLP_SERVICE_NAME'],
        }),
        useOnFetchTracer(),
      ],
    });
    const res = await runtime(req, env, ctx);
    ctx.waitUntil(fakePromise(runtime[DisposableSymbols.asyncDispose]()));
    return res as unknown as Response;
  },
} satisfies ExportedHandler<Env>;
