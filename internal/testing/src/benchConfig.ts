import { BenchOptions } from 'vitest';

const isCI = !!process.env['CI'];

const duration = useNumberEnv('BENCH_DURATION', isCI ? 30000 : 3000);
const warmupTime = useNumberEnv('BENCH_WARMUP_TIME', isCI ? 5000 : 300);
const warmupIterations = useNumberEnv('BENCH_WARMUP_ITERATIONS', isCI ? 10 : 3);

export const benchConfig: BenchOptions = {
  time: duration,
  warmupTime,
  warmupIterations,
  throws: true,
};

export function useNumberEnv(envName: string, defaultValue: number): number {
  const value = process.env[envName];
  if (!value) {
    return defaultValue;
  }
  return parseInt(value, 10);
}
