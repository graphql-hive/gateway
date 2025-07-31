import fs from 'fs/promises';
import path from 'path';
import { Server } from '@internal/proc';
import { getEnvStr, isDebug } from '@internal/testing';
import { it } from 'vitest';
import { createMemorySampleLineChart } from './chart';
import {
  getHeaviestFramesFromHeapSamplingProfile,
  HeapSamplingProfileFrame,
} from './heapsampling';
import { loadtest, LoadtestOptions } from './loadtest';

const supportedFlags = [
  'short' as const,
  'heapsnaps' as const,
  'moreruns' as const,
  'chart' as const,
  'sampling' as const,
];

/**
 * Allows controlling the memtest runs with the `MEMTEST` environment variable.
 *
 * {@link supportedFlags Supported flags} are:
 * - `short` Runs the loadtest for `30s` and the calmdown for `10s` instead of the defaults.
 * - `heapsnaps` Takes heap snapshots instead of the defaults.
 * - `moreruns` Does `5` runs instead of the defaults.
 * - `chart` Writes the memory consumption chart.
 * - `sampling` Will write the heap allocation sampling profile regardless of whether the test fails.
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
   * Ignores the `default` and runs with `true` if {@link flags MEMTEST has the `heapsnaps` flag}.
   *
   * @default false
   */
  takeHeapSnapshots?: boolean;
  /**
   * Idling duration before loadtests {@link runs run} in milliseconds.
   *
   * @default 10_000
   */
  idle?: number;
  /**
   * Duration of the loadtest for each {@link runs run} in milliseconds.
   *
   * Ignores the `default` and runs for `30s` if {@link flags MEMTEST has the `short` flag}.
   *
   * @default 120_000
   */
  duration?: number;
  /**
   * Calmdown duration after loadtesting {@link runs run} in milliseconds.
   *
   * Ignores the `default` and runs for `10s` if {@link flags MEMTEST has the `short` flag}.
   *
   * @default 30_000
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
    idle = 10_000,
    duration = flags.includes('short') ? 30_000 : 120_000,
    calmdown = flags.includes('short') ? 10_000 : 30_000,
    runs = flags.includes('moreruns') ? 5 : 3,
    takeHeapSnapshots = flags.includes('heapsnaps'),
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
        async onHeapSnapshot(heapsnapshot) {
          if (flags.includes('heapsnaps')) {
            await fs.copyFile(
              heapsnapshot.file,
              path.join(
                cwd,
                `memtest-run-${heapsnapshot.run}-${heapsnapshot.phase}_${startTime}.heapsnapshot`,
              ),
            );
          }
          return onHeapSnapshot?.(heapsnapshot);
        },
      });

      // TODO: track failed requests during the loadtest, if any

      const heapSamplingProfileFile = path.join(
        cwd,
        `memtest_${startTime}.heapprofile`,
      );
      if (flags.includes('sampling')) {
        await fs.writeFile(
          heapSamplingProfileFile,
          JSON.stringify(loadtestResult.profile),
        );
      }

      // NOTE: memory usage slop trend check is disabled allowing us to run the tests in parallel in the CI
      //       and we dont want to disable it _only_ in the CI because we want consistant tests locally and in the CI
      // import { calculateTrendSlope } from './chart'
      // const slope = calculateTrendSlope(loadtestResult.samples.map(({ mem }) => mem));
      // expect
      //   .soft(slope, 'Consistent memory increase detected')
      //   .toBeLessThan(10);

      const unexpectedHeavyFrames = getHeaviestFramesFromHeapSamplingProfile(
        loadtestResult.profile,
      )
        .filter(
          (frame) =>
            // node internals can allocate a lot, but they on their own cannot leak
            // if other things triggered by node internals are leaking, they will show up in other frames
            !frame.callstack.every(
              (stack) =>
                stack.file?.startsWith('node:') || stack.name === '(root)',
            ) &&
            // memoized functions are usually heavy because they're called a lot, but they're proven to not leak
            !(
              frame.name === 'set' &&
              frame.callstack.some((stack) => stack.name === 'memoized')
            ) &&
            // graphql visitor enter is heavy because it's called a lot, but it's proven to not leak
            !(
              frame.name === 'enter' &&
              frame.callstack.some((stack) => stack.name === 'visit')
            ) &&
            // graphql visitor leave is heavy because it's called a lot, but it's proven to not leak
            !(
              frame.name === 'leave' &&
              frame.callstack.some((stack) => stack.name === 'visit')
            ) &&
            // the (fake)promises themselves cannot leak, things they do can
            !(
              frame.name === 'then' &&
              frame.callstack.some(
                (stack) => stack.name === 'handleMaybePromise',
              )
            ) &&
            // Anonymous `set` frames are false-positives
            !(frame.name === 'set' && frame.file == null),
        )
        .filter((frame) => {
          if (expectedHeavyFrame) {
            // user-provided heavy frames check
            return !expectedHeavyFrame(frame);
          }
          return true;
        });

      if (unexpectedHeavyFrames.length) {
        let msg = `Unexpected heavy frames detected! In total ${unexpectedHeavyFrames.length} and they are:\n\n`;
        let i = 1;
        for (const frame of unexpectedHeavyFrames) {
          msg += `${i++}. ${frame.name} (${frame.file || '<anonymous>'})\n`;
          for (const stack of frame.callstack) {
            msg += `  ${stack.name} (${stack.file || '<anonymous>'})\n`;
          }
          msg += '\n';
        }
        msg += `Writing heap sampling profile to ${heapSamplingProfileFile}`;

        await fs.writeFile(
          heapSamplingProfileFile,
          JSON.stringify(loadtestResult.profile),
        );

        expect.fail(msg);
      }
    },
  );
}
