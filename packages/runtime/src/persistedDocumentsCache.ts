import type {
  Layer2CacheConfiguration,
  PersistedDocumentsCache,
} from '@graphql-hive/core';
import type { Logger } from '@graphql-hive/logger';
import type { GatewayPersistedDocumentsCacheOptions } from './types';

export interface DisposableLayer2CacheConfiguration
  extends Layer2CacheConfiguration {
  dispose(): Promise<void>;
}

/**
 * Creates a Redis-based cache implementation for persisted documents.
 * This enables sharing cached documents across multiple gateway instances.
 *
 * The Redis connection is lazy, it connects on first use.
 */
export function createPersistedDocumentsCache(
  options: GatewayPersistedDocumentsCacheOptions,
  logger: Logger,
): DisposableLayer2CacheConfiguration | undefined {
  if (!options.redis?.url) {
    // Warn if TTL options are provided but Redis is not configured
    if (options.ttlSeconds != null || options.notFoundTtlSeconds != null) {
      logger.warn(
        'TTL options provided but redis.url is missing; persisted documents cache will be disabled',
      );
    }
    return undefined;
  }

  const redisUrl = options.redis.url;

  // Validate Redis URL format
  if (!/^rediss?:\/\/.+/.test(redisUrl)) {
    logger.error(
      'Invalid Redis URL format: %s. Expected format: redis://host:port or rediss://host:port. Persisted documents cache will be disabled.',
      redisUrl,
    );
    return undefined;
  }

  const keyPrefix = options.redis.keyPrefix ?? 'hive:pd:';

  let redis: import('ioredis').default | null = null;
  let connectionPromise: Promise<import('ioredis').default | null> | null =
    null;
  let connectionFailed = false;

  // Track error counts for rate-limited logging
  let getErrorCount = 0;
  let setErrorCount = 0;

  async function getRedisClient(): Promise<import('ioredis').default | null> {
    if (redis) {
      return redis;
    }
    if (connectionFailed) {
      return null;
    }
    if (connectionPromise) {
      return connectionPromise;
    }

    connectionPromise = (async () => {
      try {
        // Dynamically import ioredis to avoid requiring it when not using Redis
        const Redis = (await import('ioredis')).default;
        const client = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 3,
        });
        await client.connect();
        redis = client; // Only set if connection succeeds
        logger.debug('Connected to Redis for persisted documents cache');
        return redis;
      } catch (error) {
        connectionFailed = true;
        connectionPromise = null; // Reset to allow potential future retry mechanisms
        logger.error(
          { err: error },
          'Failed to connect to Redis for persisted documents cache. Cache will be disabled for this process: %s',
          error instanceof Error ? error.message : String(error),
        );
        return null;
      }
    })();

    return connectionPromise;
  }

  const cache: PersistedDocumentsCache = {
    async get(key) {
      const client = await getRedisClient();
      if (!client) {
        return null;
      }
      try {
        return await client.get(keyPrefix + key);
      } catch (error) {
        getErrorCount++;
        // Log first error and every 100th at warn level, rest at debug
        const shouldLogWarn = getErrorCount === 1 || getErrorCount % 100 === 0;
        if (shouldLogWarn) {
          logger.warn(
            { err: error, key, errorCount: getErrorCount },
            'Redis get failed for persisted document (error #%d): %s',
            getErrorCount,
            error instanceof Error ? error.message : String(error),
          );
        } else {
          logger.debug(
            'Redis get failed for persisted document %s: %s',
            key,
            error instanceof Error ? error.message : String(error),
          );
        }
        return null;
      }
    },
    async set(key, value, opts) {
      const client = await getRedisClient();
      if (!client) {
        return;
      }
      try {
        if (opts?.ttl) {
          await client.set(keyPrefix + key, value, 'EX', opts.ttl);
        } else {
          await client.set(keyPrefix + key, value);
        }
      } catch (error) {
        setErrorCount++;
        // Log first error and every 100th at warn level, rest at debug
        const shouldLogWarn = setErrorCount === 1 || setErrorCount % 100 === 0;
        if (shouldLogWarn) {
          logger.warn(
            { err: error, key, errorCount: setErrorCount },
            'Redis set failed for persisted document (error #%d): %s',
            setErrorCount,
            error instanceof Error ? error.message : String(error),
          );
        } else {
          logger.debug(
            'Redis set failed for persisted document %s: %s',
            key,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    },
  };

  return {
    cache,
    ttlSeconds: options.ttlSeconds,
    notFoundTtlSeconds: options.notFoundTtlSeconds,
    async dispose() {
      if (redis) {
        await redis.quit();
        redis = null;
        connectionPromise = null;
        connectionFailed = false;
        logger.debug('Disconnected from Redis for persisted documents cache');
      }
    },
  };
}
