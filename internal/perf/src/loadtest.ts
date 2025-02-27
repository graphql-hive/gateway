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
  /** Callback for memory snapshots during the loadtest. */
  onMemorySnapshot?(
    memoryUsageInMB: number,
    phase: LoadtestPhase,
    snapshots: LoadtestMemorySnapshots,
  ): Promise<void> | void;
}

export type LoadtestPhase = 'idle' | 'loadtest' | 'calmdown';

/** Memory usage snapshots in MB of the {@link LoadtestOptions.server GraphQL server}.*/
export type LoadtestMemorySnapshots = {
  /** Memory usage snapshots in MB during the given loadtest phase.*/
  [phase in LoadtestPhase]: number[];
} & {
  /** All memory snapshots in MB of all the loadtest phases. */
  total: number[];
};

export async function loadtest(
  opts: LoadtestOptions,
): Promise<LoadtestMemorySnapshots> {
  const {
    cwd,
    vus = 100,
    idle,
    duration,
    calmdown,
    memorySnapshotWindow,
    server,
    query,
    onMemorySnapshot,
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

  let writingHeapSnapshot = false;
  let phase: LoadtestPhase = 'idle';
  const snapshots: LoadtestMemorySnapshots = {
    loadtest: [],
    idle: [],
    calmdown: [],
    total: [],
  };

  // we dont use a `setInterval` because the proc.getStats is async and we want stats ordered by time
  (async () => {
    while (!ctrl.signal.aborted) {
      await setTimeout(memorySnapshotWindow);
      try {
        const { mem } = await server.getStats();
        if (writingHeapSnapshot) {
          continue; // ignore memory spikes while writing heap snapshots
        }
        snapshots[phase].push(mem);
        snapshots.total.push(mem);
        await onMemorySnapshot?.(mem, phase, snapshots);
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
  writingHeapSnapshot = true;
  await inspector.writeHeapSnapshot(path.join(cwd, 'baseline.heapsnapshot'));
  writingHeapSnapshot = false;

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
  await Promise.race([waitForExit, serverThrowOnExit]);
  writingHeapSnapshot = true;
  await inspector.writeHeapSnapshot(path.join(cwd, 'target.heapsnapshot'));
  writingHeapSnapshot = false;

  phase = 'calmdown';
  await inspector.collectGarbage();
  await Promise.race([setTimeout(calmdown), serverThrowOnExit]);
  writingHeapSnapshot = true;
  await inspector.writeHeapSnapshot(path.join(cwd, 'final.heapsnapshot'));
  writingHeapSnapshot = false;

  return snapshots;
}
