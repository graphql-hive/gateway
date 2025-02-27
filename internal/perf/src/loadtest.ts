import path from 'path';
import { setTimeout } from 'timers/promises';
import { ProcOptions, Server, spawn } from '@internal/proc';
import { trimError } from '@internal/testing';
import { connectInspector } from './inspector';

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
  /** The snapshotting window of the GraphQL server memory in milliseconds. */
  memorySnapshotWindow: number;
  /** The GraphQL server on which the loadtest is running. */
  server: Server;
  /**
   * The GraphQL query to execute for the loadtest.
   */
  query: string;
  /** Callback for memory sampling during the loadtest. */
  onMemorySample?(samples: LoadtestMemorySample[]): Promise<void> | void;
}

export type LoadtestPhase =
  | 'idle'
  | 'loadtest'
  | 'calmdown'
  | 'gc'
  | 'heapsnapshot';

/** Memory usage snapshot in MB of the {@link LoadtestOptions.server GraphQL server} during the given {@link phase}.*/
export interface LoadtestMemorySample {
  phase: LoadtestPhase;
  /** Moment in time when the sample was taken. */
  time: Date;
  /**
   * CPU usage as a percentage. The percentage accompanies all cores: if the CPU
   * has 2 cores, 100% means 100% of 1 core; and 200% means 100% of both cores.
   */
  cpu: number;
  /** Memory usage in MB. */
  mem: number;
}

export async function loadtest(
  opts: LoadtestOptions,
): Promise<{ samples: LoadtestMemorySample[] }> {
  const {
    cwd,
    vus = 100,
    idle,
    duration,
    calmdown,
    memorySnapshotWindow,
    server,
    query,
    onMemorySample: onMemorySnapshot,
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

  using inspector = await connectInspector(server);

  let phase: LoadtestPhase = 'idle';

  // we dont use a `setInterval` because the proc.getStats is async and we want stats ordered by time
  const samples: LoadtestMemorySample[] = [];
  (async () => {
    while (!ctrl.signal.aborted) {
      await setTimeout(memorySnapshotWindow);
      try {
        const stats = await server.getStats();
        const sample: LoadtestMemorySample = {
          phase,
          time: new Date(),
          ...stats,
        };
        samples.push(sample);
        await onMemorySnapshot?.(samples);
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

  await Promise.race([setTimeout(idle), serverThrowOnExit]);
  phase = 'heapsnapshot';
  await inspector.writeHeapSnapshot(path.join(cwd, 'baseline.heapsnapshot'));

  phase = 'loadtest';
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
  phase = 'loadtest';
  await Promise.race([waitForExit, serverThrowOnExit]);

  phase = 'gc';
  await inspector.collectGarbage();
  phase = 'calmdown';
  await Promise.race([setTimeout(calmdown), serverThrowOnExit]);
  phase = 'heapsnapshot';
  await inspector.writeHeapSnapshot(path.join(cwd, 'final.heapsnapshot'));

  return { samples };
}
