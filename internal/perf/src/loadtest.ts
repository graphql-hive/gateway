import { HeapProfiler } from 'inspector';
import path from 'path';
import { setTimeout } from 'timers/promises';
import { ProcOptions, Server, spawn } from '@internal/proc';
import { trimError } from '@internal/testing';
import { cancelledSignal } from '@internal/testing/vitest';
import { fetch } from '@whatwg-node/fetch';
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
  /** The snapshotting window of the server memory in milliseconds. */
  memorySnapshotWindow: number;
  /** The server on which the loadtest is running. */
  server: Server;
  /**
   * The GraphQL query to execute for the loadtest.
   * Either `query` or `pathname` must be provided.
   */
  query?: string;
  /**
   * The HTTP pathname to request for the loadtest.
   * Either `query` or `pathname` must be provided.
   */
  pathname?: string;
  /**
   * Whether to take heap snapshots on the end of the `idle` phase and then at the end
   * of the `calmdown` {@link LoadtestPhase phase} in each of the {@link runs}.
   *
   * @default false
   */
  takeHeapSnapshots?: boolean;
  /**
   * Whether to perform heap allocation sampling during the complete loadtest run.
   * This is the "allocation sampling" feature of the V8 memory profiling you may
   * find in the Chrome DevTools. It approximates memory allocations by sampling
   * long operations with minimal overhead and get a breakdown by JavaScript execution
   * stack.
   *
   * @default false
   */
  performHeapSampling?: boolean;
  /**
   * Should the loadtest immediatelly error out on the first failed request?
   *
   * This is useful and disabled by default because we want to guarantee that the gateway
   * does not yield under pressure. However, for testing purposes, it's useful to allow
   * failing requests to debug what's happening.
   *
   * @default false
   */
  allowFailingRequests?: boolean;
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
  heapSnapshots: LoadtestHeapSnapshot[];
  heapSamplingProfile: HeapProfiler.SamplingHeapProfile | null;
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
    pathname,
    takeHeapSnapshots,
    performHeapSampling,
    allowFailingRequests,
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

  if (!query && !pathname) {
    throw new Error('Either "query" or "pathname" must be provided');
  }

  if (query && pathname) {
    throw new Error('Cannot provide both "query" and "pathname"');
  }

  const startTime = new Date();

  // we create a random id to make sure the heapsnapshot files are unique and easily distinguishable in the filesystem
  // when running multiple loadtests in parallel. see e2e/opentelemetry memtest as an example
  const id = Math.random().toString(36).slice(2, 6);

  // make sure the endpoint works before starting the loadtests
  // the request here matches the request done in loadtest-script.ts or http-loadtest-script.ts
  if (query) {
    const res = await fetch(
      `${server.protocol}://localhost:${server.port}/graphql`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(
        `Status is not 200, got status ${res.status} ${res.statusText} and body:\n${text}`,
      );
      err.name = 'ResponseError';
      throw err;
    }
    if (!text.includes('"data":{')) {
      const err = new Error(`Body does not contain "data":\n${text}`);
      err.name = 'ResponseError';
      throw err;
    }
  } else if (pathname) {
    const res = await fetch(
      `${server.protocol}://localhost:${server.port}${pathname}`,
    );
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(
        `Status is not 200, got status ${res.status} ${res.statusText} and body:\n${text}`,
      );
      err.name = 'ResponseError';
      throw err;
    }
  }

  const ctrl = new AbortController();
  using _ = {
    [Symbol.dispose]() {
      ctrl.abort();
    },
  };

  cancelledSignal.throwIfAborted();
  cancelledSignal.addEventListener('abort', () => {
    ctrl.abort('Test run cancelled');
  });

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
      cwd,
      id,
      startTime,
      inspector,
      phase,
      run,
    );
    heapsnapshots.push(heapsnapshot);
    await onHeapSnapshot?.(heapsnapshot);
  }

  // start heap sampling after idling (no need to sample anything during the idling phase)
  const stopHeapSampling = performHeapSampling
    ? await inspector.startHeapSampling()
    : () => null; // no-op if no heap allocation sampling

  for (; run <= runs; run++) {
    phase = 'loadtest';
    const [, waitForExit] = await spawn(
      {
        cwd,
        ...procOptions,
        env: {
          ...procOptions.env,
          ALLOW_FAILING_REQUESTS: allowFailingRequests ? 1 : null,
        },
        signal: AbortSignal.any([
          ctrl.signal,
          AbortSignal.timeout(
            duration +
              // allow 30s for the k6 process to exit gracefully
              30_000,
          ),
        ]),
      },
      'k6',
      'run',
      `--vus=${vus}`,
      `--duration=${duration}ms`,
      // graphql
      query &&
        `--env=URL=${server.protocol}://localhost:${server.port}/graphql`,
      query && `--env=QUERY=${query}`,
      // pathname
      pathname &&
        `--env=URL=${server.protocol}://localhost:${server.port}${pathname}`,
      path.join(
        __dirname,
        query ? 'graphql-loadtest-script.ts' : 'pathname-loadtest-script.ts',
      ),
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
        cwd,
        id,
        startTime,
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
    heapSnapshots: heapsnapshots,
    heapSamplingProfile: await stopHeapSampling(),
  };
}

async function createHeapSnapshot(
  cwd: string,
  id: string,
  startTime: Date,
  inspector: Inspector,
  phase: LoadtestPhase,
  run: number,
): Promise<LoadtestHeapSnapshot> {
  const time = new Date();
  const filenameSafeStartTime = startTime
    .toISOString()
    // replace time colons with dashes to make it a valid filename
    .replaceAll(':', '-')
    // remove milliseconds
    .split('.')[0];
  const file = path.join(
    cwd,
    `loadtest-${id}-${phase}-run-${run}-${filenameSafeStartTime}.heapsnapshot`,
  );
  await inspector.writeHeapSnapshot(file);
  return { phase, run, time, file };
}
