import type { Logger } from '@graphql-hive/logger';
import { GatewayPlugin } from '../types';

export function useCacheDebug<TContext extends Record<string, any>>({
  log: rootLog,
}: {
  log: Logger;
}): GatewayPlugin<TContext> {
  return {
    onContextBuilding({ context }) {
      // onContextBuilding might not execute at all so we use the root log
      rootLog = context.log;
    },
    onCacheGet({ key }) {
      const log = rootLog.child({ key }, '[useCacheDebug] ');
      log.debug('Get');
      return {
        onCacheGetError({ error }) {
          log.error({ key, error }, 'Error');
        },
        onCacheHit({ value }) {
          log.debug({ key, value }, 'Hit');
        },
        onCacheMiss() {
          log.debug({ key }, 'Miss');
        },
      };
    },
    onCacheSet({ key, value, ttl }) {
      const log = rootLog.child({ key, value, ttl }, '[useCacheDebug] ');
      log.debug('Set');
      return {
        onCacheSetError({ error }) {
          log.error({ error }, 'Error');
        },
        onCacheSetDone() {
          log.debug('Done');
        },
      };
    },
    onCacheDelete({ key }) {
      const log = rootLog.child({ key }, '[useCacheDebug] ');
      log.debug('Delete');
      return {
        onCacheDeleteError({ error }) {
          log.error({ error }, 'Error');
        },
        onCacheDeleteDone() {
          log.debug('Done');
        },
      };
    },
  };
}
