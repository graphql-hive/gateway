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
  /** Idling duration before loadtest in milliseconds. */
  idle: number;
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
    idle,
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
  using _ = {
    [Symbol.dispose]() {
      ctrl.abort();
    },
  };

  let state: 'idle' | 'loadtest' | 'calmdown' = 'idle';
  const memoryInMBSnapshots = {
    loadtest: [] as number[],
    idle: [] as number[],
    calmdown: [] as number[],
    total: [] as number[],
  };

  // we dont use a `setInterval` because the proc.getStats is async and we want stats ordered by time
  (async () => {
    while (!ctrl.signal.aborted) {
      await setTimeout(memorySnapshotWindow);
      try {
        const { mem } = await server.getStats();
        memoryInMBSnapshots[state].push(mem);
        memoryInMBSnapshots.total.push(mem);
        debugLog(`server memory during ${state}: ${mem}MB`);
      } catch (err) {
        if (!ctrl.signal.aborted) {
          throw err;
        }
        return; // couldve been aborted after timeout or while waiting for stats
      }
    }
  })();

  const serverThrowOnExit = server.waitForExit.then(() => {
    throw new Error(
      `Server exited before the loadtest finished\n${trimError(server.getStd('both'))}`,
    );
  });

  debugLog(`Idling...`);
  await Promise.race([setTimeout(idle), serverThrowOnExit]);

  debugLog(`Loadtesting...`);
  state = 'loadtest';
  const [, waitForExit] = await spawn(
    {
      cwd,
      ...procOptions,
      signal: AbortSignal.any([
        ctrl.signal,
        AbortSignal.timeout(
          duration +
            // allow 5s for the k6 process to exit gracefully
            5_000,
        ),
      ]),
    },
    'k6',
    'run',
    `--vus=${vus}`,
    `--duration=${duration}ms`,
    `--env=URL=${server.protocol}://localhost:${server.port}/graphql`,
    `--env=QUERY=${query}`,
    path.join(__dirname, 'loadtest-script.ts'),
  );
  await Promise.race([waitForExit, serverThrowOnExit]);

  debugLog(`Loadtest completed, waiting for calmdown...`);
  state = 'calmdown';
  await Promise.race([setTimeout(calmdown), serverThrowOnExit]);

  if (isDebug('loadtest')) {
    const chart = createLineChart(
      memoryInMBSnapshots.total.map(
        (_, i) => `${i + memorySnapshotWindow / 1000}. sec`,
      ),
      [
        {
          label: 'Idle',
          data: memoryInMBSnapshots.idle,
        },
        {
          label: 'Loadtest',
          data: [
            ...memoryInMBSnapshots.idle.map(() => null), // skip idle data
            ...memoryInMBSnapshots.loadtest,
          ],
        },
        {
          label: 'Calmdown',
          data: [
            ...memoryInMBSnapshots.idle.map(() => null), // skip idle data
            ...memoryInMBSnapshots.loadtest.map(() => null), // skip loadtest data
            ...memoryInMBSnapshots.calmdown,
          ],
        },
      ],
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
