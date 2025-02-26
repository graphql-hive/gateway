import { Logger } from '@graphql-mesh/types';
import { GatewayPlugin } from '../types';

export function useCacheDebug<TContext extends Record<string, any>>(opts: {
  logger: Logger;
}): GatewayPlugin<TContext> {
  return {
    onCacheGet({ key }) {
      return {
        onCacheGetError({ error }) {
          const cacheGetErrorLogger = opts.logger.child('cache-get-error');
          cacheGetErrorLogger.error({ key, error });
        },
        onCacheHit({ value }) {
            const cacheHitLogger = opts.logger.child('cache-hit');
            cacheHitLogger.debug({ key, value });
        },
        onCacheMiss() {
            const cacheMissLogger = opts.logger.child('cache-miss');
            cacheMissLogger.debug({ key });
        },
      };
    },
    onCacheSet({ key, value, ttl }) {
      return {
        onCacheSetError({ error }) {
            const cacheSetErrorLogger = opts.logger.child('cache-set-error');
            cacheSetErrorLogger.error({ key, value, ttl, error });
        },
        onCacheSetDone() {
            const cacheSetDoneLogger = opts.logger.child('cache-set-done');
            cacheSetDoneLogger.debug({ key, value, ttl });
        },
      };
    },
    onCacheDelete({ key }) {
      return {
        onCacheDeleteError({ error }) {
            const cacheDeleteErrorLogger = opts.logger.child('cache-delete-error');
            cacheDeleteErrorLogger.error({ key, error });
        },
        onCacheDeleteDone() {
            const cacheDeleteDoneLogger = opts.logger.child('cache-delete-done');
            cacheDeleteDoneLogger.debug({ key });
        },
      };
    },
  };
}
