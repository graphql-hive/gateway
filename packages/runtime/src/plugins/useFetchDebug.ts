import type { Logger } from '@graphql-mesh/types';
import type { GatewayPlugin } from '../types';
import { crypto } from '@whatwg-node/fetch';

export function useFetchDebug<TContext extends Record<string, any>>(opts: {
  logger: Logger;
}): GatewayPlugin<TContext> {
  return {
    onFetch({ url, options, logger = opts.logger }) {
      logger = logger.child('fetch');
      const fetchId = crypto.randomUUID();
      logger.debug('request', {
        fetchId,
        url,
        ...(options || {}),
        body: options?.body && JSON.stringify(options.body),
        headers: options?.headers && JSON.stringify(options.headers),
      });
      return function onFetchDone({ response }) {
        logger.debug('response', () => ({
          fetchId,
          status: response.status,
          headers: JSON.stringify(
            Object.fromEntries(response.headers.entries()),
          ),
        }));
      };
    },
  };
}
