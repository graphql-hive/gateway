import { KeyValueCache } from '@graphql-mesh/types';
import type { ExecutionArgs } from '@graphql-tools/executor';
import { Executor, memoize1 } from '@graphql-tools/utils';
import { handleMaybePromise, iterateAsync } from '@whatwg-node/promise-helpers';
import type { SelectionSetNode } from 'graphql';
import {
  OnCacheDeleteHook,
  OnCacheDeleteHookResult,
  OnCacheGetHook,
  OnCacheGetHookResult,
  OnCacheSetHook,
  OnCacheSetHookResult,
} from './types';

export function checkIfDataSatisfiesSelectionSet(
  selectionSet: SelectionSetNode,
  data: any,
): boolean {
  if (Array.isArray(data)) {
    return data.every((item) =>
      checkIfDataSatisfiesSelectionSet(selectionSet, item),
    );
  }
  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      const field = selection;
      const responseKey = field.alias?.value || field.name.value;
      if (data[responseKey] != null) {
        if (field.selectionSet) {
          if (
            !checkIfDataSatisfiesSelectionSet(
              field.selectionSet,
              data[field.name.value],
            )
          ) {
            return false;
          }
        }
      } else {
        return false;
      }
    } else if (selection.kind === 'InlineFragment') {
      const inlineFragment = selection;
      if (
        !checkIfDataSatisfiesSelectionSet(inlineFragment.selectionSet, data)
      ) {
        return false;
      }
    }
  }
  return true;
}

export const defaultQueryText = /* GraphQL */ `
  # Welcome to GraphiQL
  # GraphiQL is an in-browser tool for writing, validating,
  # and testing GraphQL queries.
  #
  # Type queries into this side of the screen, and you will
  # see intelligent typeaheads aware of the current GraphQL
  # type schema and live syntax and validation errors
  # highlighted within the text.
  #
  # GraphQL queries typically start with a "{" character.
  # Lines that start with a # are ignored.
  #
  # An example GraphQL query might look like:
  #
  #     {
  #       field(arg: "value") {
  #         subField
  #       }
  #     }
  #
`;

export function delayInMs(ms: number, signal?: AbortSignal) {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        globalThis.clearTimeout(timeoutId);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export const getExecuteFnFromExecutor = memoize1(
  function getExecuteFnFromExecutor(executor: Executor) {
    return function executeFn(args: ExecutionArgs) {
      return executor({
        document: args.document,
        variables: args.variableValues,
        operationName: args.operationName ?? undefined,
        rootValue: args.rootValue,
        context: args.contextValue,
        signal: args.signal,
      });
    };
  },
);

export function wrapCacheWithHooks({
  cache,
  onCacheGet,
  onCacheSet,
  onCacheDelete,
}: {
  cache: KeyValueCache;
  onCacheGet: OnCacheGetHook[];
  onCacheSet: OnCacheSetHook[];
  onCacheDelete: OnCacheDeleteHook[];
}) {
  return new Proxy(cache, {
    get(target, prop: keyof KeyValueCache, receiver) {
      switch (prop) {
        case 'get': {
          if (onCacheGet.length === 0) {
            break;
          }
          return function cacheGet(key: string) {
            const onCacheGetResults: OnCacheGetHookResult[] = [];
            return handleMaybePromise(
              () =>
                iterateAsync(
                  onCacheGet,
                  (onCacheGet) =>
                    onCacheGet({
                      key,
                      cache,
                    }),
                  onCacheGetResults,
                ),
              () =>
                handleMaybePromise(
                  () => target.get(key),
                  (value) =>
                    value == null
                      ? handleMaybePromise(
                          () =>
                            iterateAsync(
                              onCacheGetResults,
                              (onCacheGetResult) =>
                                onCacheGetResult?.onCacheMiss?.(),
                            ),
                          () => value,
                        )
                      : handleMaybePromise(
                          () =>
                            iterateAsync(
                              onCacheGetResults,
                              (onCacheGetResult) =>
                                onCacheGetResult?.onCacheHit?.({ value }),
                            ),
                          () => value,
                        ),
                  (error) =>
                    handleMaybePromise(
                      () =>
                        iterateAsync(onCacheGetResults, (onCacheGetResult) =>
                          onCacheGetResult?.onCacheGetError?.({ error }),
                        ),
                      () => {
                        throw error;
                      },
                    ),
                ),
            );
          };
        }
        case 'set': {
          if (onCacheSet.length === 0) {
            break;
          }
          return function cacheSet(
            key: string,
            value: string,
            opts?: { ttl?: number },
          ) {
            const onCacheSetResults: OnCacheSetHookResult[] = [];
            return handleMaybePromise(
              () =>
                iterateAsync(
                  onCacheSet,
                  (onCacheSet) =>
                    onCacheSet({
                      key,
                      value,
                      ttl: opts?.ttl,
                      cache,
                    }),
                  onCacheSetResults,
                ),
              () =>
                handleMaybePromise(
                  () => target.set(key, value, opts),
                  (result) =>
                    handleMaybePromise(
                      () =>
                        iterateAsync(onCacheSetResults, (onCacheSetResult) =>
                          onCacheSetResult?.onCacheSetDone?.(),
                        ),
                      () => result,
                    ),
                  (err) =>
                    handleMaybePromise(
                      () =>
                        iterateAsync(onCacheSetResults, (onCacheSetResult) =>
                          onCacheSetResult?.onCacheSetError?.({ error: err }),
                        ),
                      () => {
                        throw err;
                      },
                    ),
                ),
            );
          };
        }
        case 'delete': {
          if (onCacheDelete.length === 0) {
            break;
          }
          return function cacheDelete(key: string) {
            const onCacheDeleteResults: OnCacheDeleteHookResult[] = [];
            return handleMaybePromise(
              () =>
                iterateAsync(onCacheDelete, (onCacheDelete) =>
                  onCacheDelete({
                    key,
                    cache,
                  }),
                ),
              () =>
                handleMaybePromise(
                  () => target.delete(key),
                  (result) =>
                    handleMaybePromise(
                      () =>
                        iterateAsync(
                          onCacheDeleteResults,
                          (onCacheDeleteResult) =>
                            onCacheDeleteResult?.onCacheDeleteDone?.(),
                        ),
                      () => result,
                    ),
                ),
              (err) =>
                handleMaybePromise(
                  () =>
                    iterateAsync(onCacheDeleteResults, (onCacheDeleteResult) =>
                      onCacheDeleteResult?.onCacheDeleteError?.({ error: err }),
                    ),
                  () => {
                    throw err;
                  },
                ),
            );
          };
        }
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
