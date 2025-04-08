import type { Logger } from '@graphql-hive/logger';
import { GatewayPlugin } from '../types';

export function useCacheDebug<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  return {
    onCacheGet({ key }) {
      log = log.child({ key });
      log.debug('cache get');
      return {
        onCacheGetError({ error }) {
          log.error({ key, error }, 'error');
        },
        onCacheHit({ value }) {
          log.debug({ key, value }, 'hit');
        },
        onCacheMiss() {
          log.debug({ key }, 'miss');
        },
      };
    },
    onCacheSet({ key, value, ttl }) {
      log = log.child({ key, value, ttl });
      log.debug('cache set');
      return {
        onCacheSetError({ error }) {
          log.error({ error }, 'error');
        },
        onCacheSetDone() {
          log.debug('done');
        },
      };
    },
    onCacheDelete({ key }) {
      log = log.child({ key });
      log.debug('cache delete');
      return {
        onCacheDeleteError({ error }) {
          log.error({ error }, 'error');
        },
        onCacheDeleteDone() {
          log.debug('done');
        },
      };
    },
  };
}
