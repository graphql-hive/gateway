import fs from 'fs/promises';
import path from 'path';
import { setTimeout } from 'timers/promises';
import { ProcOptions, Server, spawn } from '@internal/proc';
import { isDebug, trimError } from '@internal/testing';
import { createLineChart } from './chart';

export interface LoadtestOptions extends ProcOptions {
  cwd: string;
  /** @default 100 */
  vus?: number;
  /** Duration of the loadtest in milliseconds. */
  duration: number;
  /** Calmdown duration of the loadtest in milliseconds. This should be enough allowing the GC to kick in. */
  calmdown: number;
  /**
   * The snapshotting window of the GraphQL server memory in milliseconds.
   *
   * @default 1_000
   */
  memorySnapshotWindow?: number;
  /** The GraphQL server on which the loadtest is running. */
  server: Server;
  /**
   * The GraphQL query to execute for the loadtest.
   */
  query: string;
}

export async function loadtest(opts: LoadtestOptions) {
  const {
    cwd,
    vus = 100,
    duration,
    calmdown,
    memorySnapshotWindow = 1_000,
    server,
    query,
    ...procOptions
  } = opts;

  if (duration < 3_000) {
    throw new Error(`Duration has to be at least 3s, got "${duration}"`);
  }

  const ctrl = new AbortController();
  const signal = AbortSignal.any([
    ctrl.signal,
    AbortSignal.timeout(
      duration +
        // allow 1s for the k6 process to exit gracefully
        1_000,
    ),
  ]);

  debugLog(`Starting loadtest...`);

  const [, waitForExit] = await spawn(
    {
      cwd,
      ...procOptions,
      signal,
    },
    'k6',
    'run',
    `--vus=${vus}`,
    `--duration=${duration}ms`,
    `--env=URL=${server.protocol}://localhost:${server.port}/graphql`,
    `--env=QUERY=${query}`,
    path.join(__dirname, 'loadtest-script.ts'),
  );
  using _ = {
    [Symbol.dispose]() {
      ctrl.abort();
    },
  };

  const memoryInMBSnapshots: number[] = [];

  // we dont use a `setInterval` because the proc.getStats is async and we want stats ordered by time
  (async () => {
    while (!signal.aborted) {
      await setTimeout(memorySnapshotWindow);
      try {
        const { mem } = await server.getStats();
        memoryInMBSnapshots.push(mem);
        debugLog(`[loadtest] server memory: ${mem}MB`);
      } catch (err) {
        if (!signal.aborted) {
          throw err;
        }
        return; // couldve been aborted after timeout or while waiting for stats
      }
    }
  })();

  const serverWaitForExit = server.waitForExit.then(() => {
    throw new Error(
      `Server exited before the loadtest finished\n${trimError(server.getStd('both'))}`,
    );
  });

  // loadtest
  await Promise.race([waitForExit, serverWaitForExit]);

  debugLog(`Loadtest completed, waiting for calmdown...`);

  // calmdown
  await Promise.race([setTimeout(calmdown), serverWaitForExit]);

  if (isDebug('loadtest')) {
    const chart = createLineChart(
      {
        label: 'Memory usage',
        x: memoryInMBSnapshots.map(
          (_, i) => `${i + memorySnapshotWindow / 1000}. sec`,
        ),
        y: memoryInMBSnapshots,
      },
      {
        yTicksCallback: (tickValue) => `${tickValue} MB`,
      },
    );
    await fs.writeFile(
      path.join(cwd, 'loadtest-memory-snapshots.svg'),
      chart.toBuffer(),
    );
  }

  return { memoryInMBSnapshots };
}

function debugLog(msg: string) {
  if (isDebug('loadtest')) {
    console.log(`[loadtest] ${msg}`);
  }
}
