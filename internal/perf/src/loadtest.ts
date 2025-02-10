import path from 'path';
import { setTimeout } from 'timers/promises';
import { ProcOptions, Server, spawn } from '@internal/proc';
import { isDebug, trimError } from '@internal/testing';

export interface LoadtestOptions extends ProcOptions {
  cwd: string;
  /** @default 100 */
  vus?: number;
  /** Duration of the loadtest in milliseconds. */
  duration: number;
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
        if (isDebug()) {
          console.log(`[loadtest] server memory: ${mem}MB`);
        }
      } catch (err) {
        if (!signal.aborted) {
          throw err;
        }
        return; // couldve been aborted after timeout or while waiting for stats
      }
    }
  })();

  await Promise.race([
    waitForExit,
    server.waitForExit.then(() => {
      throw new Error(
        `Server exited before the loadtest finished\n${trimError(server.getStd('both'))}`,
      );
    }),
  ]);

  return { memoryInMBSnapshots };
}
