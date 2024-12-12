import { subgraphNameByExecutionRequest } from '@graphql-mesh/fusion-runtime';
import { mapMaybePromise, MaybePromise } from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { GatewayContext, GatewayPlugin } from '../types';

export interface UpstreamRetryOptions {
  /**
   * The maximum number of retries to attempt.
   */
  maxRetries: number;
  /**
   * The delay between retries in milliseconds.
   * If the upstream returns `Retry-After` header, the delay will be the value of the header.
   * @default 1000
   */
  retryDelay?: number;
  /**
   * A function that determines whether a response should be retried.
   * If the upstream returns `Retry-After` header, the response will be retried.
   *
   * @default (response) => response.status >= 500 || response.status === 429
   */
  shouldRetry?: (response: Response) => boolean;
}

export interface UpstreamRetryPayload {
  url: string;
  options: RequestInit;
  context: GatewayContext;
  subgraphName?: string;
}

export type UpstreamRetryPluginOptions =
  | UpstreamRetryOptions
  | ((payload: UpstreamRetryPayload) => UpstreamRetryOptions | undefined);

export function useUpstreamRetry<TContext extends Record<string, any>>(
  opts: UpstreamRetryPluginOptions,
): GatewayPlugin<TContext> {
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const retryOptions = typeof opts === 'function' ? opts : () => opts;
  return {
    onFetch({ url, options, context, fetchFn, setFetchFn, executionRequest }) {
      const subgraphName =
        executionRequest &&
        subgraphNameByExecutionRequest.get(executionRequest);
      const optsForReq = retryOptions({ url, options, context, subgraphName });
      if (optsForReq) {
        const {
          maxRetries,
          retryDelay = 1000,
          shouldRetry = (res) => res.status >= 500 || res.status === 429,
        } = optsForReq;
        if (maxRetries > 0) {
          setFetchFn(
            function (url, options, context, info): MaybePromise<Response> {
              let retries = maxRetries + 1;
              let response: Response;
              function retry(): MaybePromise<Response> {
                retries--;
                try {
                  if (retries < 0) {
                    return response;
                  }
                  const requestTime = Date.now();
                  return mapMaybePromise(
                    fetchFn(url, options, context, info),
                    (currRes) => {
                      response = currRes;
                      let retryAfterSeconds: number | undefined;
                      const retryAfterHeader =
                        response.headers.get('Retry-After');
                      if (retryAfterHeader) {
                        retryAfterSeconds = parseInt(retryAfterHeader);
                        if (isNaN(retryAfterSeconds)) {
                          const dateTime = new Date(retryAfterHeader).getTime();
                          if (!isNaN(dateTime)) {
                            retryAfterSeconds = dateTime - requestTime;
                          }
                        }
                      }
                      let currentRetryDelay: number | undefined;
                      if (retryAfterSeconds) {
                        currentRetryDelay = retryAfterSeconds * 1000;
                      } else if (shouldRetry(response)) {
                        currentRetryDelay = retryDelay;
                      }
                      if (currentRetryDelay) {
                        return new Promise((resolve) => {
                          const timeout = setTimeout(() => {
                            timeouts.delete(timeout);
                            resolve(retry());
                          }, retryDelay);
                          timeouts.add(timeout);
                        });
                      } else {
                        return response;
                      }
                    },
                    (e) => {
                      if (retries < 0) {
                        throw e;
                      }
                      return retry();
                    },
                  );
                } catch (e) {
                  if (retries < 0) {
                    throw e;
                  }
                  return retry();
                }
              }
              return retry();
            },
          );
        }
      }
    },
    [DisposableSymbols.dispose]() {
      for (const timeout of timeouts) {
        clearTimeout(timeout);
        timeouts.delete(timeout);
      }
    },
  };
}
