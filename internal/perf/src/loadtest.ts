import fs from 'fs/promises';
import { HeapProfiler } from 'inspector';
import os from 'os';
import path from 'path';
import { setTimeout } from 'timers/promises';
import { ProcOptions, Server, spawn } from '@internal/proc';
import { trimError } from '@internal/testing';
import { connectInspector, Inspector } from './inspector';

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
  /** How many times to run the loadtests? */
  runs: number;
  /** The snapshotting window of the GraphQL server memory in milliseconds. */
  memorySnapshotWindow: number;
  /** The GraphQL server on which the loadtest is running. */
  server: Server;
  /**
   * The GraphQL query to execute for the loadtest.
   */
  query: string;
  /**
   * Whether to take heap snapshots on the end of the `idle` phase and then at the end
   * of the `calmdown` {@link LoadtestPhase phase} in each of the {@link runs}.
   *
   * @default false
   */
  takeHeapSnapshots?: boolean;
  /** Callback for memory sampling during the loadtest. */
  onMemorySample?(samples: LoadtestMemorySample[]): Promise<void> | void;
  /** Callback when the heapsnapshot has been written on disk. */
  onHeapSnapshot?(snapshot: LoadtestHeapSnapshot): Promise<void> | void;
}

export type LoadtestPhase = 'idle' | 'loadtest' | 'calmdown';

/** Memory usage snapshot in MB of the {@link LoadtestOptions.server GraphQL server} during the given {@link phase}.*/
export interface LoadtestMemorySample {
  phase: LoadtestPhase;
  /** The {@link LoadtestOptions.runs run} number, starts with 1. */
  run: number;
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

/** Memory heap snapshot in MB of the {@link LoadtestOptions.server GraphQL server} at the end of the given {@link phase}.*/
export interface LoadtestHeapSnapshot {
  phase: LoadtestPhase;
  /** The {@link LoadtestOptions.runs run} number, starts with 1. */
  run: number;
  /** Moment in time when the sample was taken. */
  time: Date;
  /** Path to the file where the .heapsnapshot is located. */
  file: string;
}

export async function loadtest(opts: LoadtestOptions): Promise<{
  samples: LoadtestMemorySample[];
  heapsnapshots: LoadtestHeapSnapshot[];
  profile: HeapProfiler.SamplingHeapProfile;
}> {
  const {
    cwd,
    vus = 100,
    idle,
    duration,
    calmdown,
    runs,
    memorySnapshotWindow,
    server,
    query,
    takeHeapSnapshots,
    onMemorySample,
    onHeapSnapshot,
    ...procOptions
  } = opts;

  if (duration < 3_000) {
    throw new Error(`Duration has to be at least 3s, got "${duration}"`);
  }

  if (runs < 1) {
    throw new Error(`At least one run is necessary, got "${runs}"`);
  }

  const ctrl = new AbortController();
  using _ = {
    [Symbol.dispose]() {
      ctrl.abort();
    },
  };

  const heapsnapshotCwd = await fs.mkdtemp(
    path.join(os.tmpdir(), 'hive-gateway_perf_loadtest_heapsnapshots'),
  );

  using inspector = await connectInspector(server);

  let phase: LoadtestPhase = 'idle';
  let run = 1;

  // we dont use a `setInterval` because the proc.getStats is async and we want stats ordered by time
  const samples: LoadtestMemorySample[] = [];
  const memorySnapshotting = (async () => {
    while (!ctrl.signal.aborted) {
      await setTimeout(memorySnapshotWindow);
      try {
        const stats = await server.getStats();
        if (ctrl.signal.aborted) return;
        const sample: LoadtestMemorySample = {
          phase,
          run,
          time: new Date(),
          ...stats,
        };
        samples.push(sample);
        await onMemorySample?.(samples);
      } catch (err) {
        if (!ctrl.signal.aborted) {
          throw err;
        }
        return; // couldve been aborted after timeout or while waiting for stats
      }
    }
  })();

  const heapsnapshots: LoadtestHeapSnapshot[] = [];
  const serverThrowOnExit = server.waitForExit.then(() => {
    throw new Error(
      `Server exited before the loadtest finished\n${trimError(server.getStd('both'))}`,
    );
  });

  await Promise.race([setTimeout(idle), serverThrowOnExit, memorySnapshotting]);

  if (takeHeapSnapshots) {
    const heapsnapshot = await createHeapSnapshot(
      heapsnapshotCwd,
      inspector,
      phase,
      run,
    );
    heapsnapshots.push(heapsnapshot);
    await onHeapSnapshot?.(heapsnapshot);
  }

  // start heap sampling after idling (no need to sample anything during the idling phase)
  const stopHeapSampling = await inspector.startHeapSampling();

  for (; run <= runs; run++) {
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
    await Promise.race([waitForExit, serverThrowOnExit, memorySnapshotting]);

    phase = 'calmdown';
    await inspector.collectGarbage();
    await Promise.race([
      setTimeout(calmdown),
      serverThrowOnExit,
      memorySnapshotting,
    ]);

    if (takeHeapSnapshots) {
      const heapsnapshot = await createHeapSnapshot(
        heapsnapshotCwd,
        inspector,
        phase,
        run,
      );
      heapsnapshots.push(heapsnapshot);
      await onHeapSnapshot?.(heapsnapshot);
    }
  }

  return {
    samples,
    heapsnapshots,
    profile: await stopHeapSampling(),
  };
}

async function createHeapSnapshot(
  cwd: string,
  inspector: Inspector,
  phase: LoadtestPhase,
  run: number,
): Promise<LoadtestHeapSnapshot> {
  const time = new Date();
  const file = path.join(cwd, `${phase}-run-${run}-${Date.now()}.heapsnapshot`);
  await inspector.writeHeapSnapshot(file);
  return { phase, run, time, file };
}
