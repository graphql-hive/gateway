import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';
import { createTenv, handleDockerHostNameInURLOrAtPath } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

const { gateway, gatewayRunner, fs: tenvFs } = createTenv(__dirname);

const sdl = gunzipSync(
  await fs.readFile(path.join(__dirname, 'supergraph.graphql.gz')),
).toString();

interface ReloadStats {
  schemaChanges: number;
  maxEventLoopBlockMs: number;
  heapUsedMB: number;
}

describe.each([
  { supergraphFunction: 'sync', gracefulSchemaReload: false },
  { supergraphFunction: 'async', gracefulSchemaReload: false },
  { supergraphFunction: 'async', gracefulSchemaReload: true },
])(
  'Large supergraph reload with $supergraphFunction supergraph function and graceful schema reload $gracefulSchemaReload',
  ({ supergraphFunction, gracefulSchemaReload }) => {
    async function setup() {
      let supergraphPath = await tenvFs.tempfile('supergraph.graphql', sdl);
      const volumes: { host: string; container: string }[] = [];
      if (gatewayRunner.includes('docker')) {
        supergraphPath = await handleDockerHostNameInURLOrAtPath(
          supergraphPath,
          volumes,
        );
      }
      const gw = await gateway({
        args: ['supergraph'],
        env: {
          SUPERGRAPH_PATH: supergraphPath,
          SUPERGRAPH_FUNCTION: supergraphFunction,
          GRACEFUL_SCHEMA_RELOAD: gracefulSchemaReload ? 1 : 0,
        },
        runner: { docker: { volumes } },
      });
      // handleDockerHostNameInURLOrAtPath leaves the host path as the volume source
      const hostSupergraphPath = volumes[0]?.host || supergraphPath;

      async function getStats(): Promise<ReloadStats> {
        const res = await fetch(
          `${gw.protocol}://localhost:${gw.port}/reload-stats`,
        );
        return res.json();
      }

      let reloads = 0;
      async function reload() {
        const { schemaChanges } = await getStats();
        await tenvFs.write(
          hostSupergraphPath,
          `${sdl}\n# reload ${++reloads}\n`,
        );
        // wait for the polling interval to pass
        await setTimeout(10_100);
        const start = performance.now();
        // any graphql request triggers the polling check
        await expect(gw.execute({ query: '{ __typename }' })).resolves.toEqual({
          data: { __typename: 'Query' },
        });
        const timeout = AbortSignal.timeout(30_000);
        for (;;) {
          timeout.throwIfAborted();
          const stats = await getStats();
          if (stats.schemaChanges > schemaChanges) {
            return { ...stats, reloadMs: performance.now() - start };
          }
          await setTimeout(100);
        }
      }

      // initial load
      await expect(gw.execute({ query: '{ __typename }' })).resolves.toEqual({
        data: { __typename: 'Query' },
      });

      return { getStats, reload };
    }

    it(
      'should not retain superseded schemas',
      { timeout: 120_000 },
      async () => {
        const { getStats, reload } = await setup();

        const { heapUsedMB: baseline } = await getStats();
        const heaps: number[] = [];
        for (let i = 0; i < 3; i++) {
          heaps.push((await reload()).heapUsedMB);
        }

        // a leak retains a whole schema generation (hundreds of MB) per reload
        expect(
          heaps.at(-1)! - baseline,
          `heap after GC grew from ${baseline.toFixed()}MB to ${heaps.map((h) => h.toFixed()).join('MB, ')}MB`,
        ).toBeLessThan(baseline / 2);
      },
    );

    it(
      'should not block the event loop for the whole reload',
      { timeout: 60_000 },
      async () => {
        const { reload } = await setup();

        const { maxEventLoopBlockMs, reloadMs } = await reload();

        expect(
          maxEventLoopBlockMs,
          `event loop was blocked for ${maxEventLoopBlockMs.toFixed()}ms during a ${reloadMs.toFixed()}ms reload`,
        ).toBeLessThan(reloadMs / 4);
      },
    );
  },
);
