import { getEnvNum, isCI } from '~internal/env';
import type { BenchRunOptions } from 'vitest';

const duration = getEnvNum('BENCH_DURATION') ?? (isCI() ? 30000 : 3000);
const warmupTime = getEnvNum('BENCH_WARMUP_TIME') ?? (isCI() ? 5000 : 300);
const warmupIterations =
  getEnvNum('BENCH_WARMUP_ITERATIONS') ?? (isCI() ? 10 : 3);

export const benchConfig: BenchRunOptions = {
  time: duration,
  warmupTime,
  warmupIterations,
  throws: true,
};
