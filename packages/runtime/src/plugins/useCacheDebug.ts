import { Logger } from '@graphql-mesh/types';
import { GatewayPlugin } from '../types';

export function useCacheDebug<TContext extends Record<string, any>>(opts: {
  logger: Logger;
}): GatewayPlugin<TContext> {
  return {
    onCacheGet({ key }) {
      const cacheGetLogger = opts.logger.child('cache-get');
      const keyLogger = cacheGetLogger.child({
        key,
      });
      return {
        onCacheGetError({ error }) {
          keyLogger.error({ error });
        },
        onCacheHit({ value }) {
          keyLogger.debug({ cacheHit: value });
        },
        onCacheMiss() {
          keyLogger.debug('cache-miss');
        },
      };
    },
    onCacheSet({ key, value, ttl }) {
      const cacheSetLogger = opts.logger.child('cache-set');
      const keyLogger = cacheSetLogger.child({
        key,
      });
      return {
        onCacheSetError({ error }) {
          keyLogger.error({
            error,
            value,
            ttl,
          });
        },
        onCacheSetDone() {
          keyLogger.debug({
            value,
            ttl,
            success: true,
          });
        },
      };
    },
    onCacheDelete({ key }) {
      const cacheDeleteLogger = opts.logger.child('cache-delete');
      const keyLogger = cacheDeleteLogger.child({
        key,
      });
      return {
        onCacheDeleteError({ error }) {
          keyLogger.error({ error });
        },
        onCacheDeleteDone() {
          keyLogger.debug({ success: true });
        },
      };
    },
  };
}
