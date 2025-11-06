import {
  createDeferredPromise,
  DeferredPromise,
} from '@whatwg-node/promise-helpers';
import { describe, expect, it, vi } from 'vitest';
import { getLazyFactory, getLazyPromise, memoize1Promise } from '../src/utils';

describe('utils', () => {
  it('getLazyPromise', async () => {
    const expectedValue = 'lazy value';
    let deferred: DeferredPromise<string>;
    const handlerSpy = vi.fn(() => {
      deferred = createDeferredPromise<string>();
      return deferred.promise;
    });
    const lazyFactory = getLazyPromise(handlerSpy);
    const lazyValue1 = lazyFactory();
    expect(lazyValue1).toBeInstanceOf(Promise);

    // After resolving the promise, calling again should return the resolved value immediately
    deferred!.resolve(expectedValue);
    await new Promise(process.nextTick); // Wait a tick for the promise to resolveq
    const lazyValue2 = lazyFactory();
    expect(lazyValue2).toBe(expectedValue);

    expect(handlerSpy).toHaveBeenCalledTimes(1);
  });
  it('getLazyValue', () => {
    const expectedValue = { value: 'lazy value' };
    const handlerSpy = vi.fn(() => expectedValue);
    const lazyFactory = getLazyPromise(handlerSpy);
    const lazyValue1 = lazyFactory();
    expect(lazyValue1).toEqual(expectedValue);

    const lazyValue2 = lazyFactory();
    expect(lazyValue2).toBe(expectedValue);

    expect(handlerSpy).toHaveBeenCalledTimes(1);
  });
  it('getLazyFactory', () => {
    const addFn = vi.fn((a: number, b: number) => a + b);
    const multiplyFn = vi.fn((a: number, b: number) => a * b);
    const factorySpy = vi.fn((op: 'add' | 'multiply') => {
      if (op === 'add') {
        return addFn;
      } else {
        return multiplyFn;
      }
    });
    const lazyFactory = getLazyFactory(() => factorySpy('add'));

    const result1 = lazyFactory(2, 3);
    expect(result1).toBe(5);
    expect(addFn).toHaveBeenCalledTimes(1);
    expect(multiplyFn).toHaveBeenCalledTimes(0);
    expect(factorySpy).toHaveBeenCalledTimes(1);

    const result2 = lazyFactory(4, 5);
    expect(result2).toBe(9);
    expect(addFn).toHaveBeenCalledTimes(2);
    expect(multiplyFn).toHaveBeenCalledTimes(0);
    expect(factorySpy).toHaveBeenCalledTimes(1); // Still only called once
  });
  it('memoize1Promise', async () => {
    const weakKey = {
      id: 1,
    };
    const expectedValue = 'computed value';
    let deferred: DeferredPromise<string>;
    const handlerSpy = vi.fn(() => {
      deferred = createDeferredPromise<string>();
      return deferred.promise;
    });
    const memoizedFn = memoize1Promise(handlerSpy);
    const res1 = memoizedFn(weakKey);
    expect(res1).toBeInstanceOf(Promise);
    expect(handlerSpy).toHaveBeenCalledTimes(1);

    // Resolve the promise
    deferred!.resolve(expectedValue);
    await new Promise(process.nextTick); // Wait a tick for the promise to resolve

    const res2 = memoizedFn(weakKey);
    expect(res2).toBe(expectedValue);
    expect(handlerSpy).toHaveBeenCalledTimes(1); // Still only called once
  });
});
