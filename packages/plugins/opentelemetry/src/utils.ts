import { isPromise } from 'util/types';
import {
  isPromise as isPromiseLike,
  mapMaybePromise as mapMaybePromiseLike,
  type MaybePromise,
} from '@graphql-tools/utils';

function mapMaybePromise<T, R>(
  value: Promise<T> | T,
  mapper: (value: T) => Promise<R> | R,
  errorMapper?: (err: unknown) => Promise<R> | R,
): Promise<R> | R {
  const res$ = mapMaybePromiseLike(value, mapper, errorMapper);
  if (isPromiseLike(res$)) {
    return toPromise(res$);
  }
  return res$;
}
export { mapMaybePromise, mapMaybePromiseLike };

export function toPromise<T>(mp: MaybePromise<T>): Promise<T> {
  if (isPromise(mp)) {
    return mp as Promise<T>;
  }
  if (isPromiseLike(mp)) {
    return {
      then: (onfullfilled, onrejected) =>
        toPromise(mp.then(onfullfilled, onrejected)),
      catch: (onrejected) => toPromise(mp.then(null, onrejected)),
      finally: (onfinally) => {
        return toPromise(
          mp.then(
            (res) => {
              onfinally?.();
              return res;
            },
            (err) => {
              onfinally?.();
              throw err;
            },
          ),
        );
      },
      [Symbol.toStringTag]: 'Promise',
    };
  }
  return Promise.resolve(mp);
}
