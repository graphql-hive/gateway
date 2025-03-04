import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { setTimeout } from 'timers/promises';
import { ProcOptions, Server, spawn } from '@internal/proc';
import { trimError } from '@internal/testing';
import {
  connectInspector,
  Inspector,
  InspectorHeapSamplingProfile,
} from './inspector';

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
   * Whether to take heap snapshots on the end of the `calmdown` {@link LoadtestPhase phase}
   * in each of the {@link runs}.
   *
   * @default false
   */
  takeHeapSnapshots?: boolean;
  /**
   * Whether to perform heap sampling (Allocation Sampling in Chrome DevTools)
   * during the `loadtest` {@link LoadtestPhase phase} in each of the {@link runs}.
   *
   * @default true
   */
  performHeapSampling?: boolean;
  /** Callback for memory sampling during the loadtest. */
  onMemorySample?(samples: LoadtestMemorySample[]): Promise<void> | void;
  /** Callback when the heapsnapshot has been written on disk. */
  onHeapSnapshot?(snapshot: LoadtestHeapSnapshot): Promise<void> | void;
  /** Callback when the heap sampling profile has been taken. */
  onHeapSamplingProfile?(
    profile: LoadtestHeapSamplingProfile,
  ): Promise<void> | void;
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

/** Heap sample profile {@link LoadtestOptions.server GraphQL server} at the end of the given {@link phase}. */
export interface LoadtestHeapSamplingProfile {
  phase: LoadtestPhase;
  /** The {@link LoadtestOptions.runs run} number, starts with 1. */
  run: number;
  /** Moment in time when the sample was taken. */
  time: Date;
  /** The heap sampling profile. */
  profile: InspectorHeapSamplingProfile;
}

export async function loadtest(opts: LoadtestOptions): Promise<{
  samples: LoadtestMemorySample[];
  heapsnapshots: LoadtestHeapSnapshot[];
  profiles: LoadtestHeapSamplingProfile[];
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
    performHeapSampling = true,
    onMemorySample,
    onHeapSnapshot,
    onHeapSamplingProfile,
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
  let skipSampling = false;
  (async () => {
    while (!ctrl.signal.aborted) {
      await setTimeout(memorySnapshotWindow);
      try {
        const stats = await server.getStats();
        if (skipSampling) continue;
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
  const profiles: LoadtestHeapSamplingProfile[] = [];

  const serverThrowOnExit = server.waitForExit.then(() => {
    throw new Error(
      `Server exited before the loadtest finished\n${trimError(server.getStd('both'))}`,
    );
  });

  await Promise.race([setTimeout(idle), serverThrowOnExit]);

  for (; run <= runs; run++) {
    const stopHeapSampling =
      performHeapSampling && (await inspector.startHeapSampling());

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

    phase = 'calmdown';
    skipSampling = true;
    await inspector.collectGarbage();
    skipSampling = false;
    await Promise.race([setTimeout(calmdown), serverThrowOnExit]);

    if (takeHeapSnapshots) {
      skipSampling = true;
      const heapsnapshot = await createHeapSnapshot(
        heapsnapshotCwd,
        inspector,
        phase,
        run,
      );
      skipSampling = false;
      heapsnapshots.push(heapsnapshot);
      await onHeapSnapshot?.(heapsnapshot);
    }
    if (stopHeapSampling) {
      const profile: LoadtestHeapSamplingProfile = {
        phase,
        run,
        time: new Date(),
        profile: await stopHeapSampling(),
      };
      profiles.push(profile);
      await onHeapSamplingProfile?.(profile);
    }
  }

  return {
    samples,
    heapsnapshots,
    profiles,
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
