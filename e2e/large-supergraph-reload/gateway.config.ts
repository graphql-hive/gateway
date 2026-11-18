import fs from 'node:fs';
import v8 from 'node:v8';
import { runInNewContext } from 'node:vm';
import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';

const SUPERGRAPH_PATH = process.env['SUPERGRAPH_PATH']!;

v8.setFlagsFromString('--expose-gc');
const gc: () => void = globalThis.Bun
  ? () => globalThis.Bun.gc(true)
  : runInNewContext('gc');

let maxEventLoopBlockMs = 0;
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  maxEventLoopBlockMs = Math.max(maxEventLoopBlockMs, now - last);
  last = now;
}, 5).unref();

let schemaChanges = 0;

export const gatewayConfig = defineConfig({
  supergraph:
    process.env['SUPERGRAPH_FUNCTION'] === 'async'
      ? async () => fs.readFileSync(SUPERGRAPH_PATH, 'utf8')
      : () => fs.readFileSync(SUPERGRAPH_PATH, 'utf8'),
  pollingInterval: 10_000, // the cli doesnt allow less
  gracefulSchemaReload:
    process.env['GRACEFUL_SCHEMA_RELOAD'] === '1'
      ? { drainTimeout: 30_000, maxConcurrentGenerations: 2 }
      : undefined,
  plugins: () => [
    {
      onSchemaChange() {
        schemaChanges++;
      },
      onRequest({ url, endResponse, fetchAPI }) {
        if (url.pathname === '/reload-stats') {
          const stats = { schemaChanges, maxEventLoopBlockMs };
          gc();
          endResponse(
            fetchAPI.Response.json({
              ...stats,
              heapUsedMB: process.memoryUsage().heapUsed / 1e6,
            }),
          );
          maxEventLoopBlockMs = 0;
          last = performance.now();
        }
      },
    } satisfies GatewayPlugin,
  ],
});
