import type {
  Layer2CacheConfiguration,
  PersistedDocumentsCache,
} from '@graphql-hive/core';
import type { Logger } from '@graphql-hive/logger';
import type { KeyValueCache } from '@graphql-mesh/types';

export interface PersistedDocumentsCacheOptions {
  ttlSeconds?: number;
  notFoundTtlSeconds?: number;
  keyPrefix?: string;
}

/**
 * Validates cache options, logs warnings for problematic values.
 * Returns normalized options with invalid values corrected.
 */
function validateCacheOptions(
  options: PersistedDocumentsCacheOptions,
  logger: Logger,
): PersistedDocumentsCacheOptions {
  const normalized = { ...options };

  if (options.ttlSeconds !== undefined && options.ttlSeconds < 0) {
    logger.warn(
      'Negative ttlSeconds (%d) provided for persisted documents cache; treating as no expiration',
      options.ttlSeconds,
    );
    normalized.ttlSeconds = undefined;
  }
  if (
    options.notFoundTtlSeconds !== undefined &&
    options.notFoundTtlSeconds < 0
  ) {
    logger.warn(
      'Negative notFoundTtlSeconds (%d) provided for persisted documents cache; treating as no expiration',
      options.notFoundTtlSeconds,
    );
    normalized.notFoundTtlSeconds = undefined;
  }
  if (options.keyPrefix !== undefined && options.keyPrefix === '') {
    logger.warn(
      'Empty keyPrefix provided for persisted documents cache; this may cause key collisions',
    );
  }

  return normalized;
}

/**
 * Creates a Layer 2 cache for persisted documents using the gateway's cache.
 * This wraps a KeyValueCache instance with the PersistedDocumentsCache interface.
 */
export function createPersistedDocumentsCache(
  options: PersistedDocumentsCacheOptions,
  kvCache: KeyValueCache<string>,
  logger: Logger,
): Layer2CacheConfiguration {
  const normalizedOptions = validateCacheOptions(options, logger);

  const keyPrefix = normalizedOptions.keyPrefix ?? 'hive:pd:';

  // Track error counts for rate-limited logging
  let getErrorCount = 0;
  let setErrorCount = 0;

  const cache: PersistedDocumentsCache = {
    async get(key) {
      try {
        const value = await kvCache.get(keyPrefix + key);
        // KeyValueCache returns undefined for missing keys, convert to null
        return value ?? null;
      } catch (error) {
        getErrorCount++;
        const shouldLogWarn = getErrorCount === 1 || getErrorCount % 100 === 0;
        if (shouldLogWarn) {
          logger.warn(
            { err: error, key, errorCount: getErrorCount },
            'Cache get failed for persisted document (error #%d): %s',
            getErrorCount,
            error instanceof Error ? error.message : String(error),
          );
        } else {
          logger.debug(
            'Cache get failed for persisted document %s: %s',
            key,
            error instanceof Error ? error.message : String(error),
          );
        }
        return null;
      }
    },
    async set(key, value, opts) {
      try {
        await kvCache.set(
          keyPrefix + key,
          value,
          opts ? { ttl: opts.ttl } : {},
        );
      } catch (error) {
        setErrorCount++;
        const shouldLogWarn = setErrorCount === 1 || setErrorCount % 100 === 0;
        if (shouldLogWarn) {
          logger.warn(
            { err: error, key, errorCount: setErrorCount },
            'Cache set failed for persisted document (error #%d): %s',
            setErrorCount,
            error instanceof Error ? error.message : String(error),
          );
        } else {
          logger.debug(
            'Cache set failed for persisted document %s: %s',
            key,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    },
  };

  return {
    cache,
    ttlSeconds: normalizedOptions.ttlSeconds,
    notFoundTtlSeconds: normalizedOptions.notFoundTtlSeconds,
  };
}
