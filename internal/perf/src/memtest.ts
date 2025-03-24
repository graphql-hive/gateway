import fs from 'fs/promises';
import path from 'path';
import { Server } from '@internal/proc';
import { isDebug } from '@internal/testing';
import { it } from 'vitest';
import { createMemorySampleLineChart } from './chart';
import {
  getHeaviestFramesFromHeapSamplingProfile,
  HeapSamplingProfileFrame,
} from './heap';
import { loadtest, LoadtestOptions } from './loadtest';

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
   * Idling duration before loadtests {@link runs run} in milliseconds.
   *
   * @default 10_000
   */
  idle?: number;
  /**
   * Duration of the loadtest for each {@link runs run} in milliseconds.
   *
   * @default 120_000
   */
  duration?: number;
  /**
   * Calmdown duration after loadtesting {@link runs run} in milliseconds.
   *
   * @default 30_000
   */
  calmdown?: number;
  /**
   * How many times to run the loadtests?
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
    duration = 120_000,
    calmdown = 30_000,
    runs = 3,
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
        idle,
        duration,
        calmdown,
        runs,
        server,
        pipeLogs: isDebug('memtest') ? 'loadtest.out' : undefined,
        async onMemorySample(samples) {
          if (isDebug('memtest')) {
            const chart = createMemorySampleLineChart(samples);
            await fs.writeFile(
              path.join(cwd, `memtest-memory-usage_${startTime}.svg`),
              chart.toBuffer(),
            );
          }
          return onMemorySample?.(samples);
        },
        async onHeapSnapshot(heapsnapshot) {
          if (isDebug('memtest')) {
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
      if (isDebug('memtest')) {
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
            // memoized functions are usually heavy because they're called a lot, but they're proven to not leak
            !(
              frame.name === 'set' &&
              frame.callstack.some((stack) => stack.name === 'memoized')
            ),
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
        expect.fail(msg);

        await fs.writeFile(
          heapSamplingProfileFile,
          JSON.stringify(loadtestResult.profile),
        );
      }
    },
  );
}
