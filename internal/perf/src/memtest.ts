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
    onHeapSnapshot,
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
            // TODO: this assumes that each of the phases happen one after each other
            const idle = samples
              .filter(({ phase }) => phase === 'idle')
              .map(({ mem }) => mem);
            const loadtest = samples
              .filter(({ phase }) => phase === 'loadtest')
              .map(({ mem }) => mem);
            const calmdown = samples
              .filter(({ phase }) => phase === 'calmdown')
              .map(({ mem }) => mem);

            const chart = createLineChart(
              samples
                .filter(
                  ({ phase }) =>
                    phase === 'idle' ||
                    phase === 'loadtest' ||
                    phase === 'calmdown',
                )
                .map(({ time }) => toTimeString(time)),
              [
                {
                  label: 'Idle',
                  data: idle,
                },
                ...(loadtest.length
                  ? [
                      {
                        label: 'Loadtest',
                        data: [
                          ...idle.map((val, i, arr) =>
                            i === arr.length - 1 ? val : null,
                          ), // skip idle data except for the last point to make a connection in the chart
                          ...loadtest,
                        ],
                      },
                    ]
                  : []),
                ...(calmdown.length
                  ? [
                      {
                        label: 'Calmdown',
                        data: [
                          ...idle.map(() => null), // skip idle data
                          ...loadtest.map((val, i, arr) =>
                            i === arr.length - 1 ? val : null,
                          ), // skip loadtest data except for the last point to make a connection in the chart
                          ...calmdown,
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
              path.join(cwd, `memtest-memory-samples_${startTime}.svg`),
              chart.toBuffer(),
            );
          }
          return onMemorySample?.(samples);
        },
        async onHeapSnapshot(type, file) {
          if (isDebug('memtest')) {
            await fs.copyFile(
              file,
              path.join(cwd, `memtest-${type}_${startTime}.heapsnapshot`),
            );
          }
          return onHeapSnapshot?.(type, file);
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

function toTimeString(date: Date) {
  let hours = date.getUTCHours().toString();
  if (hours.length === 1) {
    hours = `0${hours}`;
  }

  let minutes = date.getUTCMinutes().toString();
  if (minutes.length === 1) {
    minutes = `0${minutes}`;
  }

  let seconds = date.getUTCSeconds().toString();
  if (seconds.length === 1) {
    seconds = `0${seconds}`;
  }

  return `${hours}:${minutes}:${seconds}`;
}

function debugLog(msg: string) {
  if (isDebug('memtest')) {
    console.log(`[memtest] ${msg}`);
  }
}
