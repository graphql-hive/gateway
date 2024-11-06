import { availableParallelism, freemem } from 'node:os';

function getFreeMemInGb() {
  return freemem() / 1024 ** 2;
}

function getMaxConcurrencyPerMem() {
  return parseInt(String(getFreeMemInGb()));
}

function getMaxConcurrencyPerCpu() {
  return availableParallelism();
}

export function getMaxConcurrency() {
  if (globalThis.navigator?.hardwareConcurrency) {
    return navigator.hardwareConcurrency;
  }
  const result = Math.min(getMaxConcurrencyPerMem(), getMaxConcurrencyPerCpu());
  if (result < 1) {
    return 1;
  }
  return result;
}
