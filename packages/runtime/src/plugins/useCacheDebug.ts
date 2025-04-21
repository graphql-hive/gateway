import type { Logger } from '@graphql-hive/logger';
import { GatewayPlugin } from '../types';

export function useCacheDebug<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  let log: Logger;
  return {
    onContextBuilding({ context }) {
      // TODO: this one should execute last
      // TODO: on contextBuilding might not execute at all
      log = context.log;
    },
    onCacheGet({ key }) {
      log = log.child({ key }, '[useCacheDebug] ');
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
      log = log.child({ key, value, ttl }, '[useCacheDebug] ');
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
      log = log.child({ key }, '[useCacheDebug] ');
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
