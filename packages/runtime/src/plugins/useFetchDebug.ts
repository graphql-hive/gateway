import { FetchAPI } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export function useFetchDebug<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  let fetchAPI: FetchAPI;
  return {
    onYogaInit({ yoga }) {
      fetchAPI = yoga.fetchAPI;
    },
    onFetch({ url, options, context }) {
      let shouldLog = false;
      context.log.debug(() => (shouldLog = true));
      if (!shouldLog) {
        return; // debug level is not enabled
      }
      const fetchId = fetchAPI.crypto.randomUUID();
      const log = context.log.child({ fetchId }, '[useFetchDebug] ');
      log.debug(
        {
          url,
          body: options?.body?.toString(),
          headers: options?.headers,
          signal: options?.signal?.aborted ? options?.signal?.reason : false,
        },
        'Request',
      );
      const start = performance.now();
      return function onFetchDone({ response }) {
        log.debug(
          {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            duration: performance.now() - start,
          },
          'Response',
        );
      };
    },
  };
}
