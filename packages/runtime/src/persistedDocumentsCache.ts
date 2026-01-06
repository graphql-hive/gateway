import type {
  Layer2CacheConfiguration,
  PersistedDocumentsCache,
} from '@graphql-hive/core';
import type { Logger } from '@graphql-hive/logger';
import type { GatewayPersistedDocumentsCacheOptions } from './types';

/**
 * Creates a Redis-based cache implementation for persisted documents.
 * This enables sharing cached documents across multiple gateway instances.
 *
 * The Redis connection is lazy, it connects on first use.
 */
export function createPersistedDocumentsCache(
  options: GatewayPersistedDocumentsCacheOptions,
  logger: Logger,
): Layer2CacheConfiguration | undefined {
  if (!options.redis?.url) {
    return undefined;
  }

  const keyPrefix = options.redis.keyPrefix ?? 'hive:pd:';
  const redisUrl = options.redis.url;

  let redis: import('ioredis').default | null = null;
  let connectionPromise: Promise<import('ioredis').default | null> | null =
    null;
  let connectionFailed = false;

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
        redis = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 3,
        });
        await redis.connect();
        logger.debug('Connected to Redis for persisted documents cache');
        return redis;
      } catch (error) {
        connectionFailed = true;
        logger.warn(
          'Failed to connect to Redis for persisted documents cache: %s',
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
        logger.debug(
          'Redis get failed for persisted document %s: %s',
          key,
          error instanceof Error ? error.message : String(error),
        );
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
        logger.debug(
          'Redis set failed for persisted document %s: %s',
          key,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };

  return {
    cache,
    ttlSeconds: options.ttlSeconds,
    notFoundTtlSeconds: options.notFoundTtlSeconds,
  };
}
