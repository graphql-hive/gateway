import type { Logger } from '@graphql-mesh/types';
import type { GatewayPlugin } from '../types';
import { generateUUID } from '../utils';

export function useFetchDebug<TContext extends Record<string, any>>(opts: {
  logger: Logger;
}): GatewayPlugin<TContext> {
  return {
    onFetch({ url, options, logger = opts.logger }) {
      logger = logger.child('fetch');
      const fetchId = generateUUID();
      logger.debug('request', () => ({
        fetchId,
        url,
        ...(options || {}),
        body: options?.body && JSON.stringify(options.body, null, '  '),
        headers:
          options?.headers && JSON.stringify(options.headers, null, '  '),
      }));
      return function onFetchDone({ response }) {
        logger.debug('response', () => ({
          fetchId,
          status: response.status,
          headers: JSON.stringify(
            Object.fromEntries(response.headers.entries()),
            null,
            '  ',
          ),
        }));
      };
    },
  };
}
