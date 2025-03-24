import { it } from 'vitest';
import { abortSignalAny } from '../src/abortSignalAny';

it('should not abort if none of the signals abort', ({ expect }) => {
  const ctrl1 = new AbortController();
  const ctrl2 = new AbortController();

  const signal = abortSignalAny([ctrl1.signal, ctrl2.signal]);

  expect(() => signal.throwIfAborted()).not.toThrow();
});

it('should abort if any signal aborts', ({ expect }) => {
  const ctrl1 = new AbortController();
  const ctrl2 = new AbortController();

  const signal = abortSignalAny([ctrl1.signal, ctrl2.signal]);
  ctrl1.abort('Test');

  expect(signal).not.toBe(ctrl1.signal);

  expect(() => signal.throwIfAborted()).toThrowErrorMatchingInlineSnapshot(
    `"Test"`,
  );
});

it('should return aborted signal if aborted before any', ({ expect }) => {
  const ctrl1 = new AbortController();
  const ctrl2 = new AbortController();

  ctrl1.abort('Test');
  const signal = abortSignalAny([ctrl1.signal, ctrl2.signal]);

  expect(signal).toBe(ctrl1.signal);

  expect(() => signal.throwIfAborted()).toThrowErrorMatchingInlineSnapshot(
    `"Test"`,
  );
});
