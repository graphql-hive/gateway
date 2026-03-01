import LeakDetector from 'jest-leak-detector';
import { describe, expect, it } from 'vitest';
import { abortSignalAll } from '../src/abortSignalAll';

describe.skipIf(
  // doesnt report leaks locally, but does in the CI.
  // we confirm that there is no leaks directly in tests below
  process.env['LEAK_TEST'],
)('abortSignalAll', () => {
  it('should return the single signal passed', () => {
    const ctrl = new AbortController();

    const signal = abortSignalAll([ctrl.signal]);

    expect(ctrl.signal).toBe(signal);
  });

  it('should return undefined if no signals have been passed', () => {
    const signal = abortSignalAll([]);

    expect(signal).toBeUndefined();
  });

  it('should not abort if none of the signals abort', () => {
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();

    const signal = abortSignalAll([ctrl1.signal, ctrl2.signal]);

    expect(() => signal!.throwIfAborted()).not.toThrow();
  });

  it('should abort if all signals abort', async () => {
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();

    const signal = abortSignalAll([ctrl1.signal, ctrl2.signal]);
    ctrl1.abort('Test');
    ctrl2.abort('Test');

    expect(signal).not.toBe(ctrl1.signal);
    expect(signal).not.toBe(ctrl2.signal);

    expect(() => signal!.throwIfAborted()).toThrow('Test');
  });

  it('should not abort if only some signals abort', async () => {
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();

    const signal = abortSignalAll([ctrl1.signal, ctrl2.signal]);
    ctrl1.abort('Test');

    expect(() => signal!.throwIfAborted()).not.toThrow();
  });

  it.skipIf(
    // leak detector doesnt work with bun because setFlagsFromString is not yet implemented in Bun
    // we also assume that bun doesnt leak
    globalThis.Bun,
  )('should GC all signals after abort', async () => {
    let ctrl1: AbortController | undefined = new AbortController();
    const ctrl1Detector = new LeakDetector(ctrl1);
    const ctrl1SignalDetector = new LeakDetector(ctrl1.signal);
    let ctrl2: AbortController | undefined = new AbortController();
    const ctrl2Detector = new LeakDetector(ctrl2);
    const ctrl2SignalDetector = new LeakDetector(ctrl2.signal);

    let signal: AbortSignal | undefined = abortSignalAll([
      ctrl1.signal,
      ctrl2.signal,
    ]);
    const signalDetector = new LeakDetector(signal);

    ctrl1.abort('Test');
    ctrl2.abort('Test');

    ctrl1 = undefined;
    ctrl2 = undefined;
    signal = undefined;

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
  )(
    'should GC if some signals abort without aborting the combined signal',
    async () => {
      let ctrl1: AbortController | undefined = new AbortController();
      const ctrl1Detector = new LeakDetector(ctrl1);
      const ctrl1SignalDetector = new LeakDetector(ctrl1.signal);
      let ctrl2: AbortController | undefined = new AbortController();
      const ctrl2Detector = new LeakDetector(ctrl2);
      const ctrl2SignalDetector = new LeakDetector(ctrl2.signal);

      let signal: AbortSignal | undefined = abortSignalAll([
        ctrl1.signal,
        ctrl2.signal,
      ]);
      const signalDetector = new LeakDetector(signal);

      ctrl1.abort('Test');

      ctrl1 = undefined;
      ctrl2 = undefined;
      signal = undefined;

      await expect(ctrl1Detector.isLeaking()).resolves.toBeFalsy();
      await expect(ctrl1SignalDetector.isLeaking()).resolves.toBeFalsy();
      await expect(ctrl2Detector.isLeaking()).resolves.toBeFalsy();
      await expect(ctrl2SignalDetector.isLeaking()).resolves.toBeFalsy();
      await expect(signalDetector.isLeaking()).resolves.toBeFalsy();
    },
  );

  it.skipIf(
    // leak detector doesnt work with bun because setFlagsFromString is not yet implemented in Bun
    // we also assume that bun doesnt leak
    globalThis.Bun,
  )('should GC timeout signals without abort', async () => {
    let ctrl1: AbortController | undefined = new AbortController();
    const ctrl1Detector = new LeakDetector(ctrl1);
    const ctrl1SignalDetector = new LeakDetector(ctrl1.signal);
    let timeoutSignal: AbortSignal | undefined = AbortSignal.timeout(60_000); // longer than the test
    const timeoutSignalDetector = new LeakDetector(timeoutSignal);

    let signal: AbortSignal | undefined = abortSignalAll([
      ctrl1.signal,
      timeoutSignal,
    ]);
    const signalDetector = new LeakDetector(signal);

    // no abort
    // ctrl1.abort('Test');

    ctrl1 = undefined;
    timeoutSignal = undefined;
    signal = undefined;

    await expect(ctrl1Detector.isLeaking()).resolves.toBeFalsy();
    await expect(ctrl1SignalDetector.isLeaking()).resolves.toBeFalsy();
    await expect(timeoutSignalDetector.isLeaking()).resolves.toBeFalsy();
    await expect(signalDetector.isLeaking()).resolves.toBeFalsy();
  });
  it.skipIf(
    // leak detector doesnt work with bun because setFlagsFromString is not yet implemented in Bun
    // we also assume that bun doesnt leak
    globalThis.Bun,
  )('should GC timeout signals without some of them abort', async () => {
    let ctrl1: AbortController | undefined = new AbortController();
    const ctrl1Detector = new LeakDetector(ctrl1);
    const ctrl1SignalDetector = new LeakDetector(ctrl1.signal);
    let timeoutSignal: AbortSignal | undefined = AbortSignal.timeout(60_000); // longer than the test
    const timeoutSignalDetector = new LeakDetector(timeoutSignal);

    let signal: AbortSignal | undefined = abortSignalAll([
      ctrl1.signal,
      timeoutSignal,
    ]);
    const signalDetector = new LeakDetector(signal);

    ctrl1.abort('Test');

    ctrl1 = undefined;
    timeoutSignal = undefined;
    signal = undefined;

    await expect(ctrl1Detector.isLeaking()).resolves.toBeFalsy();
    await expect(ctrl1SignalDetector.isLeaking()).resolves.toBeFalsy();
    await expect(timeoutSignalDetector.isLeaking()).resolves.toBeFalsy();
    await expect(signalDetector.isLeaking()).resolves.toBeFalsy();
  });
});
