import { getLoader } from './getLoader.js';
import { BatchDelegateOptions } from './types.js';

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
  return Array.isArray(key) ? loader.loadMany(key) : loader.load(key);
}
