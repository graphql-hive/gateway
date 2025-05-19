import {
  delegatedResponseIterableNextCounter,
  delegateToSchema,
  getActualFieldNodes,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import { memoize1, memoize2, relocatedError } from '@graphql-tools/utils';
import { fakePromise } from '@whatwg-node/promise-helpers';
import DataLoader from 'dataloader';
import { getNamedType, GraphQLList, GraphQLSchema, print } from 'graphql';
import { BatchDelegateOptions } from './types.js';

const DEFAULT_ARGS_FROM_KEYS = (keys: ReadonlyArray<any>) => ({ ids: keys });

function createBatchFn<K = any>(options: BatchDelegateOptions) {
  const argsFromKeys = options.argsFromKeys ?? DEFAULT_ARGS_FROM_KEYS;
  const fieldName = options.fieldName ?? options.info.fieldName;
  const { valuesFromResults, lazyOptionsFn } = options;

  return function batchFn(keys: ReadonlyArray<K>) {
    return fakePromise()
      .then(() =>
        delegateToSchema({
          returnType: new GraphQLList(
            getNamedType(options.returnType || options.info.returnType),
          ),
          onLocatedError: (originalError) => {
            if (originalError.path == null) {
              return originalError;
            }

            const [pathFieldName, pathNumber, ...rest] = originalError.path;

            if (pathFieldName !== fieldName) {
              return originalError;
            }
            const pathNumberType = typeof pathNumber;
            if (pathNumberType !== 'number') {
              return originalError;
            }

            return relocatedError(originalError, [fieldName, ...rest]);
          },
          args: argsFromKeys(keys),
          ...(lazyOptionsFn == null ? options : lazyOptionsFn(options, keys)),
        }),
      )
      .then((results) => {
        const values =
          valuesFromResults == null
            ? results
            : results instanceof Error
              ? keys.map(() => results)
              : valuesFromResults(results, keys);

        return Array.isArray(values) ? values : keys.map(() => values);
      })
      .catch((error) => keys.map(() => error));
  };
}

const getLoadersMap = memoize2(function getLoadersMap<K, V, C>(
  _context: Record<string, any>,
  _schema: GraphQLSchema | SubschemaConfig<any, any, any, any>,
) {
  return new Map<string, DataLoader<K, V, C>>();
});

const GLOBAL_CONTEXT = {};

const memoizedJsonStringify = memoize1(function jsonStringify(value: any) {
  return JSON.stringify(value);
});

const memoizedPrint = memoize1(print);

function defaultCacheKeyFn(key: any) {
  if (typeof key === 'object') {
    return memoizedJsonStringify(key);
  }
  return key;
}

export function getLoader<K = any, V = any, C = K>(
  options: BatchDelegateOptions<any>,
): DataLoader<K, V, C> {
  const {
    schema,
    context,
    info,
    fieldName = info.fieldName,
    dataLoaderOptions,
    fieldNodes = info.fieldNodes[0] && getActualFieldNodes(info.fieldNodes[0]),
    selectionSet = fieldNodes?.[0]?.selectionSet,
    returnType = info.returnType,
    argsFromKeys = DEFAULT_ARGS_FROM_KEYS,
    key,
  } = options;
  const loaders = getLoadersMap<K, V, C>(context ?? GLOBAL_CONTEXT, schema);

  let cacheKey = fieldName;

  // we break the cache key for each of the next results of an iterable (stream/subscription/defer)
  // this makes sure that we don't use the cached results for the subscription
  const iterableNextCounter = delegatedResponseIterableNextCounter.get(
    context ?? GLOBAL_CONTEXT,
  );
  if (iterableNextCounter != null) {
    // TODO: should we prettify the cacheKey? is it relevant?
    cacheKey = `(#${iterableNextCounter})${cacheKey}`;
  }

  if (returnType) {
    const namedType = getNamedType(returnType);
    cacheKey += '@' + namedType.name;
  }

  if (selectionSet != null) {
    cacheKey += memoizedPrint(selectionSet);
  }

  const fieldNode = fieldNodes?.[0];
  if (fieldNode?.arguments) {
    const args = argsFromKeys([key]);
    cacheKey += fieldNode.arguments
      .filter((arg) => arg.name.value in args)
      .map((arg) => memoizedPrint(arg))
      .join(',');
  }

  let loader = loaders.get(cacheKey);

  if (loader === undefined) {
    const batchFn = createBatchFn(options);
    loader = new DataLoader<K, V, C>(batchFn, {
      // Prevents the keys to be passed with the same structure
      cacheKeyFn: defaultCacheKeyFn,
      ...dataLoaderOptions,
    });
    loaders.set(cacheKey, loader);
  }

  return loader;
}
