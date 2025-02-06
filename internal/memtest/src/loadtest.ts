import path from 'path';
import { setTimeout } from 'timers/promises';
import { ProcOptions, Server, spawn } from '@internal/proc';
import parseDuration from 'parse-duration';
import * as regression from 'regression';

export interface LoadtestOptions extends ProcOptions {
  cwd: string;
  /** @default 100 */
  vus?: number;
  /** @default 30s */
  duration?: string;
  /**
   * The memory increase threshold for the slope in the regression line of the memory snapshots.
   * @default 10
   */
  memoryIncreaseTrendThresholdInMB?: number;
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
    duration = '30s',
    memoryIncreaseTrendThresholdInMB = 10,
    server,
    query,
    ...procOptions
  } = opts;

  const durationInMs = parseDuration(duration);
  if (!durationInMs) {
    throw new Error(`Cannot parse duration "${duration}" to milliseconds`);
  }
  if (durationInMs < 3_000) {
    throw new Error(`Duration has to be at least 3s, got "${duration}"`);
  }

  const ctrl = new AbortController();
  const signal = AbortSignal.any([
    ctrl.signal,
    AbortSignal.timeout(
      durationInMs +
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
    `--duration=${duration}`,
    `--env=URL=${server.url + '/graphql'}`,
    `--env=QUERY=${query}`,
    path.join(__dirname, 'loadtest-script.ts'),
  );

  const memInMbSnapshots: number[] = [];

  // we dont use a `setInterval` because the proc.getStats is async and we want stats ordered by time
  (async () => {
    // abort as soon as the loadtest exits breaking the mem snapshot loop
    waitForExit.finally(() => ctrl.abort());

    while (!signal.aborted) {
      await setTimeout(1_000); // get memory snapshot every second
      try {
        const { mem } = await server.getStats();
        memInMbSnapshots.push(mem);
      } catch (err) {
        if (!signal.aborted) {
          throw err;
        }
        return; // couldve been aborted after timeout or while waiting for stats
      }
    }
  })();

  return {
    waitForComplete: waitForExit,
    memInMbSnapshots,
    checkMemTrend: () =>
      checkMemTrend(memInMbSnapshots, memoryIncreaseTrendThresholdInMB),
    [Symbol.dispose]() {
      ctrl.abort();
    },
  };
}

/**
 * Detects a memory increase trend in an array of memory snapshots over time using linear regression.
 *
 * @param snapshots - An array of memory snapshots in MB.
 * @param threshold - The minimum slope to consider as a significant increase.
 *
 * @throws Error if there is an increase trend, with details about the slope.
 */
function checkMemTrend(snapshots: number[], threshold: number): void {
  if (snapshots.length < 2) {
    throw new Error('Not enough memory snapshots to determine trend');
  }

  const data: [x: number, y: number][] = snapshots.map((memInMB, timestamp) => [
    timestamp,
    memInMB,
  ]);
  const result = regression.linear(data);
  const slope = result.equation[0];
  if (!slope) {
    throw new Error('Regression slope is zero');
  }

  if (slope > threshold) {
    throw new Error(
      `Memory increase trend detected with slope of ${slope}MB (exceding threshold of ${threshold}MB)`,
    );
  }
}
