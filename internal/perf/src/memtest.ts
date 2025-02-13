import fs from 'fs/promises';
import path from 'path';
import { Server } from '@internal/proc';
import { isDebug } from '@internal/testing';
import regression from 'regression';
import { it } from 'vitest';
import { createLineChart } from './chart';
import { loadtest, LoadtestOptions } from './loadtest';

export interface MemtestOptions
  extends Omit<
    LoadtestOptions,
    'memorySnapshotWindow' | 'idle' | 'duration' | 'calmdown' | 'server'
  > {
  /**
   * The snapshotting window of the GraphQL server memory in milliseconds.
   *
   * @default 1_000
   */
  memorySnapshotWindow?: number;
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
}

export function memtest(opts: MemtestOptions, setup: () => Promise<Server>) {
  const {
    cwd,
    memorySnapshotWindow = 1_000,
    idle = 10_000,
    duration = 180_000,
    calmdown = 30_000,
    onMemorySnapshot,
    ...loadtestOpts
  } = opts;
  it(
    'should have stable memory usage',
    {
      timeout: idle + duration + calmdown + 30_000, // allow 30s for the test teardown (compensate for heap snapshots)
    },
    async ({ expect }) => {
      const server = await setup();

      const startTime = new Date()
        .toISOString()
        // replace time colons with dashes to make it a valid filename
        .replaceAll(':', '-')
        // remove milliseconds
        .split('.')[0];

      const snapshots = await loadtest({
        ...loadtestOpts,
        cwd,
        memorySnapshotWindow,
        idle,
        duration,
        calmdown,
        server,
        async onMemorySnapshot(memoryUsageInMB, phase, snapshots) {
          if (isDebug('memtest')) {
            const chart = createLineChart(
              snapshots.total.map(
                (_, i) => `${i + memorySnapshotWindow / 1000}. sec`,
              ),
              [
                {
                  label: 'Idle',
                  data: snapshots.idle,
                },
                ...(snapshots.loadtest.length
                  ? [
                      {
                        label: 'Loadtest',
                        data: [
                          ...snapshots.idle.map((val, i, arr) =>
                            i === arr.length - 1 ? val : null,
                          ), // skip idle data except for the last point to make a connection in the chart
                          ...snapshots.loadtest,
                        ],
                      },
                    ]
                  : []),
                ...(snapshots.calmdown.length
                  ? [
                      {
                        label: 'Calmdown',
                        data: [
                          ...snapshots.idle.map(() => null), // skip idle data
                          ...snapshots.loadtest.map((val, i, arr) =>
                            i === arr.length - 1 ? val : null,
                          ), // skip loadtest data except for the last point to make a connection in the chart
                          ...snapshots.calmdown,
                        ],
                      },
                    ]
                  : []),
              ],
              {
                yTicksCallback: (tickValue) => `${tickValue} MB`,
              },
            );
            await fs.writeFile(
              path.join(cwd, `memtest-memory-snapshots_${startTime}.svg`),
              chart.toBuffer(),
            );
          }
          return onMemorySnapshot?.(memoryUsageInMB, phase, snapshots);
        },
      });

      const idleSlope = calculateRegressionSlope(snapshots.idle);
      debugLog(`server memory idle regression slope: ${idleSlope}`);
      expect
        .soft(idleSlope, 'Memory increase detected while idling')
        .toBeLessThanOrEqual(0);

      const loadtestSlope = calculateRegressionSlope(snapshots.loadtest);
      debugLog(`server memory loadtest regression slope: ${loadtestSlope}`);
      expect
        .soft(loadtestSlope, 'Memory never stopped growing during loadtest')
        .toBeLessThanOrEqual(1);

      const calmdownSlope = calculateRegressionSlope(snapshots.calmdown);
      debugLog(`server memory calmdown regression slope: ${calmdownSlope}`);
      expect
        .soft(calmdownSlope, 'No memory decrease detected during calmdown')
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

function debugLog(msg: string) {
  if (isDebug('memtest')) {
    console.log(`[memtest] ${msg}`);
  }
}
