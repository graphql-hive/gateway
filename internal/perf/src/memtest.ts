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
    onMemorySample,
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

      const { samples } = await loadtest({
        ...loadtestOpts,
        cwd,
        memorySnapshotWindow,
        idle,
        duration,
        calmdown,
        server,
        async onMemorySample(samples) {
          if (isDebug('memtest')) {
            const chart = createLineChart(
              samples.map((_, i) => `${i + memorySnapshotWindow / 1000}. sec`),
              [
                {
                  label: 'Idle',
                  trendline: true,
                  color: 'blue',
                  data: samples.map(({ phase, mem }) =>
                    phase === 'idle' ? mem : null,
                  ),
                },
                ...(samples.some(({ phase }) => phase === 'loadtest')
                  ? [
                      {
                        label: 'Loadtest',
                        trendline: true,
                        color: 'red',
                        data: samples.map(({ phase, mem }) =>
                          phase === 'loadtest' ? mem : null,
                        ),
                      },
                    ]
                  : []),
                ...(samples.some(({ phase }) => phase === 'calmdown')
                  ? [
                      {
                        label: 'Calmdown',
                        trendline: true,
                        color: 'orange',
                        data: samples.map(({ phase, mem }) =>
                          phase === 'calmdown' ? mem : null,
                        ),
                      },
                    ]
                  : []),
                ...(samples.some(({ phase }) => phase === 'heapsnapshot')
                  ? [
                      {
                        label: 'Heapsnapshot',
                        color: 'gray',
                        dashed: true,
                        data: samples.map(({ phase, mem }) =>
                          phase === 'heapsnapshot' ? mem : null,
                        ),
                      },
                    ]
                  : []),
                ...(samples.some(({ phase }) => phase === 'gc')
                  ? [
                      {
                        label: 'GC',
                        color: 'green',
                        dashed: true,
                        data: samples.map(({ phase, mem }) =>
                          phase === 'gc' ? mem : null,
                        ),
                      },
                    ]
                  : []),
              ],
              {
                yTicksCallback: (tickValue) => `${tickValue} MB`,
              },
            );
            await fs.writeFile(
              path.join(cwd, `memtest-memory-samples_${startTime}.svg`),
              chart.toBuffer(),
            );
          }
          return onMemorySample?.(samples);
        },
      });

      const idleSlope = calculateRegressionSlope(
        samples.filter(({ phase }) => phase === 'idle').map(({ mem }) => mem),
      );
      debugLog(`server memory idle regression slope: ${idleSlope}`);
      expect
        .soft(idleSlope, 'Memory increase detected while idling')
        .toBeLessThanOrEqual(0);

      const loadtestSlope = calculateRegressionSlope(
        samples
          .filter(({ phase }) => phase === 'loadtest')
          .map(({ mem }) => mem),
      );
      debugLog(`server memory loadtest regression slope: ${loadtestSlope}`);
      expect
        .soft(loadtestSlope, 'Memory never stopped growing during loadtest')
        .toBeLessThanOrEqual(1);

      const calmdownSlope = calculateRegressionSlope(
        samples
          .filter(({ phase }) => phase === 'calmdown')
          .map(({ mem }) => mem),
      );
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
