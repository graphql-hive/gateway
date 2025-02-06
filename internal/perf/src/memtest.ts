import { Server } from '@internal/proc';
import regression from 'regression';
import { it } from 'vitest';
import { loadtest, LoadtestOptions } from './loadtest';

export interface MemtestOptions
  extends Omit<LoadtestOptions, 'duration' | 'server'> {
  /**
   * Duration of the loadtest in milliseconds.
   *
   * @default 30_000
   */
  duration?: number;
  /**
   * Linear regression line slope threshold of the memory snapshots.
   * If the slope is greater than this value, the test will fail.
   *
   * @default 10
   */
  memoryThresholdInMB?: number;
}

export function memtest(opts: MemtestOptions, setup: () => Promise<Server>) {
  const { memoryThresholdInMB = 10, duration = 30_000, ...loadtestOpts } = opts;
  it(
    'should not have a memory increase trend',
    async ({ expect }) => {
      const server = await setup();

      using test = await loadtest({
        ...loadtestOpts,
        duration,
        server,
      });

      await test.waitForComplete;

      expect(() =>
        checkMemTrend(test.memoryInMBSnapshots, memoryThresholdInMB),
      ).not.toThrow();
    },
    {
      timeout: duration + 5_000, // allow 5s for the test to finish
    },
  );
}

/**
 * Detects a memory increase trend in an array of memory snapshots over time using linear regression.
 *
 * @param snapshots - An array of memory snapshots in MB.
 * @param threshold - The minimum slope to consider as a significant increase.
 *
 * @throws Error if there is an increase trend, with details about the slope.
 */
function checkMemTrend(snapshots: number[], threshold: number): void {
  if (snapshots.length < 2) {
    throw new Error('Not enough memory snapshots to determine trend');
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

  if (slope > threshold) {
    throw new Error(
      `Memory increase trend detected with slope of ${slope}MB (exceding threshold of ${threshold}MB)`,
    );
  }
}
