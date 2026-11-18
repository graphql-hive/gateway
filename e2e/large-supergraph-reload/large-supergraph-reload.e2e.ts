import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';
import { createTenv, handleDockerHostNameInURLOrAtPath } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, gatewayRunner, fs: tenvFs } = createTenv(__dirname);

const sdl = gunzipSync(
  await fs.readFile(path.join(__dirname, 'supergraph.graphql.gz')),
).toString();

interface ReloadStats {
  schemaChanges: number;
  maxEventLoopBlockMs: number;
  heapUsedMB: number;
}

// bun has no setFlagsFromString for exposing gc, and its gc keeps around one extra
// schema generation anyway (heap plateaus one generation above the baseline)
it.skipIf(gatewayRunner.includes('bun')).each([
  { supergraphFunction: 'sync', gracefulSchemaReload: false },
  { supergraphFunction: 'async', gracefulSchemaReload: false },
  { supergraphFunction: 'async', gracefulSchemaReload: true },
])(
  'should reload with $supergraphFunction supergraph function and graceful schema reload $gracefulSchemaReload without leaking',
  { timeout: 60_000 },
  async ({ supergraphFunction, gracefulSchemaReload }) => {
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

    // initial load
    await expect(gw.execute({ query: '{ __typename }' })).resolves.toEqual({
      data: { __typename: 'Query' },
    });
    const baseline = await getStats();

    // the cli enforces a min polling interval of 10s, so every reload costs that much.
    // a leak retains a whole schema generation (hundreds of MB) per reload, 2 reloads are plenty
    const heaps: number[] = [];
    for (let i = 1; i <= 2; i++) {
      await tenvFs.write(hostSupergraphPath, `${sdl}\n# reload ${i}\n`);
      // wait for the polling interval to pass
      await setTimeout(10_100);
      // const start = performance.now();
      // any graphql request triggers the polling check
      await expect(gw.execute({ query: '{ __typename }' })).resolves.toEqual({
        data: { __typename: 'Query' },
      });
      let stats: ReloadStats;
      const timeout = AbortSignal.timeout(30_000);
      for (;;) {
        timeout.throwIfAborted();
        stats = await getStats();
        if (stats.schemaChanges > baseline.schemaChanges + i - 1) {
          break;
        }
        await setTimeout(100);
      }
      // const reloadMs = performance.now() - start;
      heaps.push(stats.heapUsedMB);

      // TODO: the reload blocks the event loop in one big chunk (~1.6s here), we want to fix
      //       that in the future by making the stitching build async and yield in between.
      //       enable once fixed
      // expect
      //   .soft(
      //     stats.maxEventLoopBlockMs,
      //     `reload ${i} blocked the event loop for ${stats.maxEventLoopBlockMs.toFixed()}ms out of ${reloadMs.toFixed()}ms`,
      //   )
      //   .toBeLessThan(reloadMs / 4);
    }

    expect
      .soft(
        heaps.at(-1)! - baseline.heapUsedMB,
        `heap after GC grew from ${baseline.heapUsedMB.toFixed()}MB to ${heaps.map((h) => h.toFixed()).join('MB, ')}MB`,
      )
      .toBeLessThan(baseline.heapUsedMB / 2);
  },
);
