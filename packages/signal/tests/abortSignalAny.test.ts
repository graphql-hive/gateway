import LeakDetector from 'jest-leak-detector';
import { expect, it } from 'vitest';
import { abortSignalAny } from '../src/abortSignalAny';

it('should not abort if none of the signals abort', () => {
  const ctrl1 = new AbortController();
  const ctrl2 = new AbortController();

  const signal = abortSignalAny([ctrl1.signal, ctrl2.signal]);

  expect(() => signal.throwIfAborted()).not.toThrow();
});

it('should abort if any signal aborts', async () => {
  const ctrl1 = new AbortController();
  const ctrl2 = new AbortController();

  const signal = abortSignalAny([ctrl1.signal, ctrl2.signal]);
  ctrl1.abort('Test');

  expect(signal).not.toBe(ctrl1.signal);

  expect(() => signal.throwIfAborted()).toThrowError('Test');
});

it.skipIf(
  // bun doesnt use the ponyfill and wont return the first aborted signal
  globalThis.Bun,
)('should return aborted signal if aborted before any', () => {
  const ctrl1 = new AbortController();
  const ctrl2 = new AbortController();

  ctrl1.abort('Test');
  const signal = abortSignalAny([ctrl1.signal, ctrl2.signal]);

  expect(signal).toBe(ctrl1.signal);

  expect(() => signal.throwIfAborted()).toThrowError('Test');
});

it.skipIf(
  // leak detector doesnt work with bun because setFlagsFromString is not yet implemented in Bun
  // we also assume that bun doesnt leak
  globalThis.Bun,
)('should GC all signals after abort', async () => {
  let ctrl1: AbortController | null = new AbortController();
  const ctrl1Detector = new LeakDetector(ctrl1);
  const ctrl1SignalDetector = new LeakDetector(ctrl1.signal);
  let ctrl2: AbortController | null = new AbortController();
  const ctrl2Detector = new LeakDetector(ctrl2);
  const ctrl2SignalDetector = new LeakDetector(ctrl2.signal);

  let signal: AbortSignal | null = abortSignalAny([ctrl1.signal, ctrl2.signal]);
  const signalDetector = new LeakDetector(signal);

  ctrl1.abort('Test');

  ctrl1 = null;
  ctrl2 = null;
  signal = null;

  await expect(ctrl1Detector.isLeaking()).resolves.toBeFalsy();
  await expect(ctrl1SignalDetector.isLeaking()).resolves.toBeFalsy();
  await expect(ctrl2Detector.isLeaking()).resolves.toBeFalsy();
  await expect(ctrl2SignalDetector.isLeaking()).resolves.toBeFalsy();
  await expect(signalDetector.isLeaking()).resolves.toBeFalsy();
});

it.skipIf(
  // leak detector doesnt work with bun because setFlagsFromString is not yet implemented in Bun
  // we also assume that bun doesnt leak
  globalThis.Bun,
)('should GC all signals without abort', async () => {
  let ctrl1: AbortController | null = new AbortController();
  const ctrl1Detector = new LeakDetector(ctrl1);
  const ctrl1SignalDetector = new LeakDetector(ctrl1.signal);
  let ctrl2: AbortController | null = new AbortController();
  const ctrl2Detector = new LeakDetector(ctrl2);
  const ctrl2SignalDetector = new LeakDetector(ctrl2.signal);

  let signal: AbortSignal | null = abortSignalAny([ctrl1.signal, ctrl2.signal]);
  const signalDetector = new LeakDetector(signal);

  // no abort
  // ctrl1.abort('Test');

  ctrl1 = null;
  ctrl2 = null;
  signal = null;

  await expect(ctrl1Detector.isLeaking()).resolves.toBeFalsy();
  await expect(ctrl1SignalDetector.isLeaking()).resolves.toBeFalsy();
  await expect(ctrl2Detector.isLeaking()).resolves.toBeFalsy();
  await expect(ctrl2SignalDetector.isLeaking()).resolves.toBeFalsy();
  await expect(signalDetector.isLeaking()).resolves.toBeFalsy();
});
