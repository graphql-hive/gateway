export interface DeferredPromise<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
}

export function withResolvers<T = void>(): DeferredPromise<T> {
  return Promise.withResolvers<T>();
}
