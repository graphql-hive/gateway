import type {
  Layer2CacheConfiguration,
  PersistedDocumentsCache,
} from '@graphql-hive/core';
import type { KeyValueCache } from '@graphql-mesh/types';
import { fakePromise } from '@whatwg-node/promise-helpers';

export interface PersistedDocumentsCacheOptions {
  ttlSeconds?: number;
  notFoundTtlSeconds?: number;
  keyPrefix?: string;
}

/**
 * Creates a Layer 2 cache for persisted documents using the gateway's cache.
 * This wraps a KeyValueCache instance with the PersistedDocumentsCache interface.
 */
export function createPersistedDocumentsCache(
  options: PersistedDocumentsCacheOptions,
  kvCache: KeyValueCache<string>,
): Layer2CacheConfiguration {
  const cache: PersistedDocumentsCache = {
    get(key) {
      return fakePromise()
        .then(() => kvCache.get(key))
        .then((value) => {
          // KeyValueCache returns undefined for missing keys, convert to null
          return value ?? null;
        });
    },
    set(key, value, opts) {
      return kvCache.set(key, value, opts ? { ttl: opts.ttl } : {});
    },
  };

  return {
    cache,
    ttlSeconds: options.ttlSeconds,
    notFoundTtlSeconds: options.notFoundTtlSeconds,
    keyPrefix: options.keyPrefix,
  };
}
