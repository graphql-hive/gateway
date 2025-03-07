import fs from 'fs/promises';
import path from 'path';
import { Server } from '@internal/proc';
import { isDebug } from '@internal/testing';
import { it } from 'vitest';
import { createMemorySampleLineChart } from './chart';
import { getHeaviestFramesFromHeapSamplingProfile } from './heap';
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
   * @default 180_000
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
   * @default 2
   */
  runs?: number;
}

export function memtest(opts: MemtestOptions, setup: () => Promise<Server>) {
  const {
    cwd,
    memorySnapshotWindow = 1_000,
    idle = 10_000,
    duration = 180_000,
    calmdown = 30_000,
    runs = 3,
    onMemorySample,
    onHeapSnapshot,
    ...loadtestOpts
  } = opts;
  it(
    'should have stable memory usage',
    {
      timeout: (idle + duration + calmdown) * runs + 30_000, // allow 30s for the test teardown (compensate for heap snapshots)
    },
    async ({ expect }) => {
      const server = await setup();

      const startTime = new Date()
        .toISOString()
        // replace time colons with dashes to make it a valid filename
        .replaceAll(':', '-')
        // remove milliseconds
        .split('.')[0];

      const { samples, profile } = await loadtest({
        ...loadtestOpts,
        cwd,
        memorySnapshotWindow,
        idle,
        duration,
        calmdown,
        runs,
        server,
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

      if (isDebug('memtest')) {
        await fs.writeFile(
          path.join(cwd, `memtest_${startTime}.heapprofile`),
          JSON.stringify(profile),
        );
      }

      // TODO: match the trend calculation with the 'chartjs-plugin-trendline' plugin
      const slope = calculateTrendSlope(samples.map(({ mem }) => mem));
      expect
        .soft(slope, 'Consistent memory increase detected')
        .toBeLessThan(10);

      const unexpectedHeavyFrames = getHeaviestFramesFromHeapSamplingProfile(
        profile,
      ).filter(
        (frame) =>
          // these frames are expected to be big
          // TODO: inspect the callstack making sure we're filtering out precisely the right frames
          // TODO: allow the memtest user to specify the expected heavy frames
          !['register', 'WeakRef', 'any', 'set'].includes(frame.name),
      );

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
        expect.fail(msg);
        // TODO: write the heap sampling profile to disk for the user to inspect
      }
    },
  );
}

/**
 * Calculates the increase trend usind linear regression.
 *
 * It will clamp the snapshots to from 0 to 1 to get a percentage based slope.
 *
 * @param snapshots - An array of memory snapshots in MB.
 *
 * @returns The slope of the linear regression line.
 */
function calculateTrendSlope(yValues: number[]) {
  if (yValues.length < 2) {
    throw new Error(
      'At least two points are required to calculate the trend slope',
    );
  }
  const n = yValues.length;
  const xValues = yValues.map((_, i) => i + 1);

  const sumX = xValues.reduce((acc, x) => acc + x, 0);
  const sumY = yValues.reduce((acc, y) => acc + y, 0);
  const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i]!, 0);
  const sumX2 = xValues.reduce((acc, x) => acc + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
}
