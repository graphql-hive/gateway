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
