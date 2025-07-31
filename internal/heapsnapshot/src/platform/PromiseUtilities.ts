export interface DeferredPromise<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
}

export function withResolvers<T = void>(): DeferredPromise<T> {
  // @ts-expect-error not available in node 18-
  if (Promise.withResolvers) return Promise.withResolvers<T>();
  let resolveFn: (value: T) => void;
  let rejectFn: (reason: any) => void;
  const promise = new Promise<T>(function deferredPromiseExecutor(
    resolve,
    reject,
  ) {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return {
    promise,
    get resolve() {
      return resolveFn;
    },
    get reject() {
      return rejectFn;
    },
  };
}
