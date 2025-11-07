import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@internal/proc';
import { getEnvStr, isDebug } from '@internal/testing';
import { it } from 'vitest';
import { createMemorySampleLineChart } from './chart';
import {
  bytesToHuman,
  leakingObjectsInHeapSnapshotFiles,
} from './heapsnapshot';
import { loadtest, LoadtestOptions } from './loadtest';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const __project = path.resolve(__dirname, '..', '..', '..');

const supportedFlags = [
  'short' as const,
  'cleanheapsnaps' as const,
  'noheapsnaps' as const,
  'moreruns' as const,
  'chart' as const,
  'sampling' as const,
];

/**
 * Allows controlling the memtest runs with the `MEMTEST` environment variable.
 *
 * {@link supportedFlags Supported flags} are:
 * - `short` Runs the loadtest for `30s` and the calmdown for `10s` instead of the defaults.
 * - `cleanheapsnaps` Remove any existing heap snapshot (`*.heapsnapshot`) files before the test.
 * - `noheapsnaps` Disable taking heap snapshots.
 * - `moreruns` Does `10` runs instead of the defaults.
 * - `chart` Writes the memory consumption chart.
 * - `sampling` Perform and write the heap sampling profile.
 */
const flags =
  getEnvStr('MEMTEST')
    ?.split(',')
    .map((flag) => {
      flag = flag.trim().toLowerCase();
      if (!supportedFlags.includes(flag as any)) {
        throw new Error(`Unsupported MEMTEST flag: "${flag}"`);
      }
      return flag as (typeof supportedFlags)[number];
    }) || [];

export interface MemtestOptions
  extends Omit<
    LoadtestOptions,
    | 'memorySnapshotWindow'
    | 'idle'
    | 'duration'
    | 'calmdown'
    | 'runs'
    | 'server'
    | 'query'
    | 'pathname'
  > {
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
   * The snapshotting window of the GraphQL server memory in milliseconds.
   *
   * @default 1_000
   */
  memorySnapshotWindow?: number;
  /**
   * Whether to take heap snapshots on the end of the `idle` phase and then at the end
   * of the `calmdown` {@link LoadtestPhase phase} in each of the {@link runs}.
   *
   * Ignores the _@default_ and runs with `false` if {@link flags MEMTEST} has the `noheapsnaps`
   * flag provided.
   *
   * @default true
   */
  takeHeapSnapshots?: boolean;
  /**
   * Idling duration before loadtests {@link runs run} in milliseconds.
   *
   * @default 5_000
   */
  idle?: number;
  /**
   * Duration of the loadtest for each {@link runs run} in milliseconds.
   *
   * Ignores the _@default_ and runs for `10s` if {@link flags MEMTEST} has the `short`
   * flag provided.
   *
   * @default 30_000
   */
  duration?: number;
  /**
   * Calmdown duration after loadtesting {@link runs run} in milliseconds.
   *
   * Ignores the _@default_ and runs for `5s` if {@link flags MEMTEST} has the `short`
   * flag provided.
   *
   * @default 10_000
   */
  calmdown?: number;
  /**
   * How many times to run the loadtests?
   *
   * Ignores the _@default_ and does `10` runs if {@link flags MEMTEST} has the `moreruns`
   * flag provided.
   *
   * @default 5
   */
  runs?: number;
}

export function memtest(opts: MemtestOptions, setup: () => Promise<Server>) {
  const {
    cwd,
    memorySnapshotWindow = 1_000,
    idle = 5_000,
    duration = flags.includes('short') ? 10_000 : 30_000,
    calmdown = flags.includes('short') ? 5_000 : 10_000,
    runs = flags.includes('moreruns') ? 10 : 5,
    takeHeapSnapshots = !flags.includes('noheapsnaps'),
    performHeapSampling = flags.includes('sampling'),
    onMemorySample,
    onHeapSnapshot,
    ...loadtestOpts
  } = opts;
  it(
    'should have stable memory usage',
    {
      timeout:
        (idle +
          duration +
          calmdown +
          // allow 30s for the test teardown in each run
          30_000) *
        runs,
    },
    async ({ expect, task }) => {
      if (flags.includes('cleanheapsnaps')) {
        const filesInCwd = await fs.readdir(cwd, { withFileTypes: true });
        for (const file of filesInCwd) {
          if (file.isFile() && file.name.endsWith('.heapsnapshot')) {
            await fs.unlink(path.join(cwd, file.name));
          }
        }
      }

      const server = await setup();

      const startTime = new Date()
        .toISOString()
        // replace time colons with dashes to make it a valid filename
        .replaceAll(':', '-')
        // remove milliseconds
        .split('.')[0];

      const loadtestResult = await loadtest({
        ...loadtestOpts,
        cwd,
        memorySnapshotWindow,
        takeHeapSnapshots,
        performHeapSampling,
        idle,
        duration,
        calmdown,
        runs,
        server,
        pipeLogs: isDebug() ? 'loadtest.out' : undefined,
        async onMemorySample(samples) {
          if (flags.includes('chart')) {
            const chart = createMemorySampleLineChart(samples);
            await fs.writeFile(
              path.join(
                cwd,
                `memtest-${task.id}-memory-usage_${startTime}.svg`,
              ),
              chart.toBuffer(),
            );
          }
          return onMemorySample?.(samples);
        },
      });

      if (loadtestResult.heapSamplingProfile) {
        const heapSamplingProfileFile = path.join(
          cwd,
          `memtest-${task.id}_${startTime}.heapprofile`,
        );
        await fs.writeFile(
          heapSamplingProfileFile,
          JSON.stringify(loadtestResult.heapSamplingProfile),
        );
      }

      if (loadtestResult.heapSnapshots.length) {
        const diff = await leakingObjectsInHeapSnapshotFiles(
          loadtestResult.heapSnapshots.map(({ file }) => file),
        );

        // growing "(compiled code)" in memory heap snapshots, is typically not a memory leak in the traditional
        // sense, but rather a reflection of how the JavaScript engine optimizes your code. It usually
        // indicates that the V8 engine is compiling and optimizing more and more JavaScript functions as
        // your application runs
        //
        // TODO: while subtle growth is normal, an excessive and rapid increase in "(compiled code)" could be
        // a symptom of an issue where codepaths repeadetly generate and execute new functions that are
        // different from the previous ones
        delete diff['(compiled code)'];

        // "(system)" is a label used to group objects and memory allocations that are managed directly by th
        // JavaScript engine's internal systems. a growing "(system)" footprint could signal code bloat or
        // inefficient code patterns that force the engine to create many internal data structures, leading
        // to an increased "(system)" size
        //
        // TODO: use it to detect code bloat or inefficient code patterns. optimizing it will lead to better
        // JS execution performance and reduced memory usage
        delete diff['(system)'];

        if (Object.keys(diff).length) {
          expect.fail(`Leak detected on ${Object.keys(diff).length} object(s) that kept growing in every snapshot:
  ${Object.values(diff)
    .map(
      ({
        name,
        addedSize,
        removedSize,
        sizeDelta,
        addedCount,
        removedCount,
        countDelta,
      }) =>
        // use SI prefix to convert bytes to MB
        `\t- "${name}" allocated ${bytesToHuman(addedSize)}, freed ${removedSize > 0 ? bytesToHuman(removedSize) : 'nothing'} (Δ${bytesToHuman(sizeDelta)})
\t\t- ${addedCount} instances were added, ${removedCount} were removed (Δ${countDelta})`,
    )
    .join('\n')}

Please load the following heap snapshots respectively in Chrome DevTools for more details:
${loadtestResult.heapSnapshots.map(({ file }, index) => `\t${index + 1}. ${path.relative(__project, file)}`).join('\n')}`);
        }
      } else {
        expect.fail('Expected to diff heap snapshots, but none were taken.');
      }

      // no leak, remove the heap snapshots
      await Promise.all(
        loadtestResult.heapSnapshots.map(({ file }) => fs.unlink(file)),
      );
    },
  );
}
