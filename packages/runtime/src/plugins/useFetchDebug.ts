import type { Logger } from '@graphql-mesh/types';
import { FetchAPI } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export function useFetchDebug<TContext extends Record<string, any>>(opts: {
  logger: Logger;
}): GatewayPlugin<TContext> {
  let fetchAPI: FetchAPI;
  return {
    onYogaInit({ yoga }) {
      fetchAPI = yoga.fetchAPI;
    },
    onFetch({ url, options, logger = opts.logger }) {
      logger = logger.child('fetch');
      const fetchId = fetchAPI.crypto.randomUUID();
      logger.debug('request', () => ({
        fetchId,
        url,
        ...(options || {}),
        body: options?.body && JSON.stringify(options.body),
        headers: options?.headers && JSON.stringify(options.headers, null, 2),
      }));
      const start = performance.now();
      return function onFetchDone({ response }) {
        logger.debug('response', () => ({
          fetchId,
          status: response.status,
          headers: JSON.stringify(
            Object.fromEntries(response.headers.entries()),
          ),
          duration: performance.now() - start,
        }));
      };
    },
  };
}
