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
      const fetchId = fetchAPI.crypto.randomUUID();
      const log = context.log.child({ fetchId });
      log.debug(
        () => ({
          url,
          body: options?.body?.toString(),
          headers: options?.headers,
          signal: options?.signal?.aborted ? options?.signal?.reason : false,
        }),
        'http-fetch-request',
      );
      const start = performance.now();
      return function onFetchDone({ response }) {
        log.debug(
          () => ({
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            duration: performance.now() - start,
          }),
          'http-fetch-response',
        );
      };
    },
  };
}
