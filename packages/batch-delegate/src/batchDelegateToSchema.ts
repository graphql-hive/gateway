import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { GraphQLError } from 'graphql';
import { getLoader } from './getLoader.js';
import { BatchDelegateOptions } from './types.js';
import { pathToArray, relocatedError } from '@graphql-tools/utils';

export function batchDelegateToSchema<TContext = any, K = any, V = any, C = K>(
  options: BatchDelegateOptions<TContext, K, V, C>,
): any {
  const key = options.key;
  if (key == null) {
    return null;
  } else if (Array.isArray(key) && !key.length) {
    return [];
  }
  const loader = getLoader(options);
  return handleMaybePromise(
    () => (Array.isArray(key) ? loader.loadMany(key) : loader.load(key)),
    res => res,
    error => {
      if (options.info?.path && error instanceof GraphQLError) {
        return relocatedError(error, pathToArray(options.info.path));
      }
      return error;
    }
  );
}
