import { Server } from '@internal/proc';
import { isDebug } from '@internal/testing';
import regression from 'regression';
import { it } from 'vitest';
import { loadtest, LoadtestOptions } from './loadtest';

export interface MemtestOptions
  extends Omit<LoadtestOptions, 'duration' | 'server'> {
  /**
   * Duration of the loadtest in milliseconds.
   *
   * @default 60_000
   */
  duration?: number;
  /**
   * Linear regression line slope threshold of the memory snapshots.
   * If the slope is greater than this value, the test will fail.
   *
   * @default 5
   */
  slopeThreshold?: number;
}

export function memtest(opts: MemtestOptions, setup: () => Promise<Server>) {
  const { slopeThreshold = 5, duration = 60_000, ...loadtestOpts } = opts;
  it(
    'should not have a memory increase trend',
    {
      timeout: duration + 10_000, // allow 10s for the test teardown
    },
    async ({ expect }) => {
      const server = await setup();

      const { memoryInMBSnapshots } = await loadtest({
        ...loadtestOpts,
        duration,
        server,
      });

      const slope = calculateRegressionSlope(memoryInMBSnapshots);
      if (isDebug('memtest')) {
        console.log(`[memtest] server memory regression slope: ${slope}`);
      }

      expect(
        slope,
        `Memory increase trend detected with slope of ${slope} (exceding threshold of ${slopeThreshold})`,
      ).toBeLessThan(slopeThreshold);
    },
  );
}

/**
 * Detects a memory increase trend in an array of memory snapshots over time using linear regression.
 *
 * @param snapshots - An array of memory snapshots in MB.
 *
 * @returns The slope of the linear regression line.
 */
function calculateRegressionSlope(snapshots: number[]) {
  if (snapshots.length < 2) {
    throw new Error('Not enough snapshots to determine trend');
  }

  const data: [x: number, y: number][] = snapshots.map((memInMB, timestamp) => [
    timestamp,
    memInMB,
  ]);
  const result = regression.linear(data);
  const slope = result.equation[0];
  if (!slope) {
    throw new Error('Regression slope is zero');
  }

  return slope;
}
