import {
  handleMaybePromise,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';

export function getLazyPromise<T>(
  factory: () => MaybePromise<T>,
): () => MaybePromise<T> {
  let _value: MaybePromise<T>;
  return function () {
    if (_value == null) {
      _value = handleMaybePromise(factory, (value) => {
        _value = value;
        return value;
      });
    }
    return _value;
  };
}

export function getLazyValue<T>(factory: () => T): () => T {
  let _value: T;
  return function () {
    if (_value == null) {
      _value = factory();
    }
    return _value;
  };
}

export function getLazyFactory<T extends (...args: any) => any>(
  factory: () => T,
): T {
  let _value: T;
  return function (...args: Parameters<T>): ReturnType<T> {
    if (!_value) {
      _value = factory();
    }
    return _value(...args);
  } as T;
}

export function memoize1Promise<A extends WeakKey, R>(
  fn: (arg: A) => MaybePromise<R>,
): (arg: A) => MaybePromise<R> {
  const cache = new WeakMap<A, MaybePromise<R>>();
  return function memoize1PromiseHandler(arg: A): MaybePromise<R> {
    let cached = cache.get(arg);
    if (cached == null) {
      cached = handleMaybePromise(
        () => fn(arg),
        (result) => {
          cached = result;
          cache.set(arg, cached);
          return cached;
        },
      );
      cache.set(arg, cached);
    }
    return cached;
  };
}
