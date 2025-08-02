import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@internal/proc';
import { getEnvStr, isDebug } from '@internal/testing';
import { it } from 'vitest';
import { createMemorySampleLineChart } from './chart';
import { HeapSamplingProfileFrame } from './heapsampling';
import { leakingObjectsInHeapSnapshotFiles } from './heapsnapshot';
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
 * - `rapid` Runs the loadtest for `10s` and the calmdown for `5s` instead of the defaults.
 * - `short` Runs the loadtest for `30s` and the calmdown for `10s` instead of the defaults.
 * - `cleanheapsnaps` Remove any existing heap snapshot (`*.heapsnapshot`) files before the test.
 * - `noheapsnaps` Disable taking heap snapshots.
 * - `moreruns` Does `5` runs instead of the defaults.
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
  > {
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
   * Ignores the `default` and runs with `false` if {@link flags MEMTEST has the `noheapsnaps` flag}.
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
   * Ignores the `default` and runs for `10s`.
   *
   * @default 30_000
   */
  duration?: number;
  /**
   * Calmdown duration after loadtesting {@link runs run} in milliseconds.
   *
   * Ignores the `default` and runs for `5s` if {@link flags MEMTEST} has the `short`
   * flag.
   *
   * @default 10_000
   */
  calmdown?: number;
  /**
   * How many times to run the loadtests?
   *
   * Ignores the `default` and does `5` runs if {@link flags MEMTEST has the `moreruns` flag}.
   *
   * @default 3
   */
  runs?: number;
  /**
   * The heap allocation sampling profile gathered during the loadtests is analysed
   * to find the heaviest frames (frames that allocated most of the memory). These,
   * high allocation frames, are often the ones that contain a leak. But not always,
   * a frame can simply be heavy... There are some usual suspects which we safely ignore;
   * but, if the profile contains any other unexpected heavy frames, the test will fail.
   *
   * Using this callback check, you can add more "expected" heavy frames for a given test.
   *
   * BEWARE: Please be diligent when adding expected heavy frames. Carefully analyse the
   * heap sampling profile and make sure that the frame you're adding is 100% not leaking.
   */
  expectedHeavyFrame?: (frame: HeapSamplingProfileFrame) => boolean;
}

export function memtest(opts: MemtestOptions, setup: () => Promise<Server>) {
  const {
    cwd,
    memorySnapshotWindow = 1_000,
    idle = 5_000,
    duration = flags.includes('short') ? 10_000 : 30_000,
    calmdown = flags.includes('short') ? 5_000 : 10_000,
    runs = flags.includes('moreruns') ? 5 : 3,
    takeHeapSnapshots = !flags.includes('noheapsnaps'),
    performHeapSampling = flags.includes('sampling'),
    onMemorySample,
    onHeapSnapshot,
    expectedHeavyFrame,
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
    async ({ expect }) => {
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
              path.join(cwd, `memtest-memory-usage_${startTime}.svg`),
              chart.toBuffer(),
            );
          }
          return onMemorySample?.(samples);
        },
      });

      if (loadtestResult.heapSamplingProfile) {
        const heapSamplingProfileFile = path.join(
          cwd,
          `memtest_${startTime}.heapprofile`,
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
        expect.fail(`Leak detected on ${Object.keys(diff).length} objects that kept growing:
${Object.values(diff)
  .map(
    ({
      ctor,
      addedSize,
      removedSize,
      sizeDelta,
      addedCount,
      removedCount,
      countDelta,
    }) =>
      // use SI prefix to convert bytes to MB
      `\t- "${ctor}" allocated ${(addedSize / 1_000_000).toFixed(
        2,
      )}MB, freeing only ${(removedSize / 1_000_000).toFixed(2)}MB (Δ${(sizeDelta / 1_000_000).toFixed(2)}MB)
\t\t- ${addedCount} instances were added, ${removedCount} were removed (Δ${countDelta})`,
  )
  .join('\n')}

Please load the following heap snapshots respectively in Chrome DevTools for more details:
${loadtestResult.heapSnapshots.map(({ file }, index) => `\t${index + 1}. ${path.relative(__project, file)}`).join('\n')}`);
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
