import { KeyValueCache } from '@graphql-mesh/types';
import type { ExecutionArgs } from '@graphql-tools/executor';
import {
  Executor,
  getDirectiveExtensions,
  memoize1,
} from '@graphql-tools/utils';
import type { ExtractPersistedOperationId } from '@graphql-yoga/plugin-persisted-operations';
import { handleMaybePromise, iterateAsync } from '@whatwg-node/promise-helpers';
import type { GraphQLSchema, SelectionSetNode } from 'graphql';
import type { GraphQLParams } from 'graphql-yoga';
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
        schemaCoordinateInErrors: args.schemaCoordinateInErrors,
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

function urlMatches(url: string, specUrl: string | RegExp): boolean {
  if (typeof specUrl === 'string') {
    return url === specUrl;
  }
  return specUrl.test(url);
}

function normalizeDirectiveName(directiveName: string): string {
  if (directiveName.startsWith('@')) {
    return directiveName.slice(1);
  }
  return directiveName;
}

export function getDirectiveNameForFederationDirective({
  schema,
  directiveName,
  specUrl,
}: {
  schema: GraphQLSchema;
  directiveName: string;
  specUrl: string | RegExp;
}) {
  const directivesOnSchemaDef = getDirectiveExtensions<{
    link: {
      url: string;
      import: (string | { name: string; as: string })[];
    };
  }>(schema, schema);
  const normalizedDirectiveName = normalizeDirectiveName(directiveName);
  if (directivesOnSchemaDef?.['link']) {
    const linkDirectives = directivesOnSchemaDef['link'];
    for (const linkDirective of linkDirectives) {
      if (urlMatches(linkDirective.url, specUrl)) {
        const imports = linkDirective.import;
        if (imports) {
          for (const importDirective of imports) {
            if (typeof importDirective === 'string') {
              const normalizedImportDirective =
                normalizeDirectiveName(importDirective);
              if (normalizedImportDirective === normalizedDirectiveName) {
                return normalizedImportDirective;
              }
            } else {
              const normalizedImportDirective = normalizeDirectiveName(
                importDirective.name,
              );
              if (normalizedImportDirective === normalizedDirectiveName) {
                const normalizedAlias = normalizeDirectiveName(
                  importDirective.as,
                );
                return normalizedAlias;
              }
            }
          }
        }
      }
    }
  }
  return normalizedDirectiveName;
}

const specs: ExtractPersistedOperationId[] = [
  function extractPersistedOperationIdByApolloSpec(params: GraphQLParams) {
    const persistedQuery = params.extensions?.['persistedQuery'];
    if (
      persistedQuery != null &&
      typeof persistedQuery === 'object' &&
      persistedQuery['version'] === 1 &&
      typeof persistedQuery['sha256Hash'] === 'string'
    ) {
      return persistedQuery['sha256Hash'];
    }
    return null;
  },
  function extractPersistedOperationIdByHiveSpec(
    params: GraphQLParams,
    request: Request,
    _context: Record<string, any>,
  ) {
    if ('documentId' in params && typeof params.documentId === 'string') {
      return params.documentId;
    }
    const documentId = new URL(request.url).searchParams.get('documentId');
    if (documentId) {
      return documentId;
    }
    return null;
  },
];

export const defaultExtractPersistedOperationId: ExtractPersistedOperationId =
  function defaultExtractPersistedOperationId(
    params: GraphQLParams,
    request: Request,
    context: Record<string, any>,
  ) {
    for (const spec of specs) {
      const id = spec(params, request, context);
      if (id) {
        return id;
      }
    }
    return null;
  };
