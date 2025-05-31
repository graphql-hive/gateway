import './otel-setup.js';
import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';
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
    traces: true,
  },
  plugins: () =>
    process.env['MEMTEST']
      ? [
          // disable the plugin in memtests because the upstreamCallHeaders will grew forever reporting a false positive leak
        ]
      : [useOnFetchTracer()],
});
