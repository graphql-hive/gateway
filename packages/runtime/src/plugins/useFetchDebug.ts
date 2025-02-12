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
    onFetch({ url, options, logger = opts.logger, requestId }) {
      const fetchId = fetchAPI.crypto.randomUUID();
      const loggerMeta: Record<string, string> = {
        fetchId,
      };
      if (requestId) {
        loggerMeta['requestId'] = requestId;
      }
      const fetchLogger = logger.child(loggerMeta);
      const httpFetchRequestLogger = fetchLogger.child('http-fetch-request');
      httpFetchRequestLogger.debug(() => ({
        url,
        ...(options || {}),
        body: options?.body,
        headers: options?.headers,
        signal: options?.signal?.aborted ? options?.signal?.reason : false,
      }));
      const start = performance.now();
      return function onFetchDone({ response }) {
        const httpFetchResponseLogger = fetchLogger.child(
          'http-fetch-response',
        );
        httpFetchResponseLogger.debug(() => ({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          duration: performance.now() - start,
        }));
      };
    },
  };
}
