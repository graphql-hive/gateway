import { Server } from '@internal/proc';
import { isDebug } from '@internal/testing';
import regression from 'regression';
import { it } from 'vitest';
import { loadtest, LoadtestOptions } from './loadtest';

export interface MemtestOptions
  extends Omit<LoadtestOptions, 'idle' | 'duration' | 'calmdown' | 'server'> {
  /**
   * Idling duration before loadtest in milliseconds.
   *
   * @default 10_000
   */
  idle?: number;
  /**
   * Duration of the loadtest in milliseconds.
   *
   * @default 180_000
   */
  duration?: number;
  /**
   * Calmdown duration after loadtesting in milliseconds.
   *
   * @default 30_000
   */
  calmdown?: number;
  /**
   * Linear regression line slope threshold of the memory snapshots.
   * If the slope is greater than this value, the test will fail.
   *
   * @default 3
   */
  loadtestSlopeThreshold?: number;
}

export function memtest(opts: MemtestOptions, setup: () => Promise<Server>) {
  const {
    loadtestSlopeThreshold = 3,
    idle = 10_000,
    duration = 180_000,
    calmdown = 30_000,
    ...loadtestOpts
  } = opts;
  it(
    'should not have a memory increase trend',
    {
      timeout: idle + duration + calmdown + 10_000, // allow 10s for the test teardown
    },
    async ({ expect }) => {
      const server = await setup();

      const { memoryInMBSnapshots } = await loadtest({
        ...loadtestOpts,
        idle,
        duration,
        calmdown,
        server,
      });

      const idleSlope = calculateRegressionSlope(memoryInMBSnapshots.idle);
      if (isDebug('memtest')) {
        console.log(
          `[memtest] server memory idle regression slope: ${idleSlope}`,
        );
      }
      expect
        .soft(idleSlope, `Memory increase detected while idling`)
        .toBeLessThanOrEqual(0);

      const loadtestSlope = calculateRegressionSlope(
        memoryInMBSnapshots.loadtest,
      );
      if (isDebug('memtest')) {
        console.log(
          `[memtest] server memory loadtest regression slope: ${loadtestSlope}`,
        );
      }
      expect
        .soft(
          loadtestSlope,
          `Significant memory increase detected during loadtest`,
        )
        .toBeLessThanOrEqual(loadtestSlopeThreshold);

      const calmdownSlope = calculateRegressionSlope(
        memoryInMBSnapshots.calmdown,
      );
      if (isDebug('memtest')) {
        console.log(
          `[memtest] server memory calmdown regression slope: ${calmdownSlope}`,
        );
      }
      expect
        .soft(calmdownSlope, `No memory decrease detected during calmdown`)
        .toBeLessThanOrEqual(-10);
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

  return slope;
}
