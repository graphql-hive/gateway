import { isOriginalGraphQLError } from '@envelop/core';
import {
  ExecutionRequest,
  ExecutionResult,
  isAsyncIterable,
  mapMaybePromise,
  MaybeAsyncIterable,
  MaybePromise,
} from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { GatewayPlugin } from '../types';

export interface UpstreamRetryOptions {
  /**
   * The maximum number of retries to attempt.
   */
  maxRetries: number;
  /**
   * The minimum delay between retries in milliseconds, but this will be increased on each attempt.
   * If the upstream returns `Retry-After` header, the delay will be the value of the header.
   * @default 1000
   */
  retryDelay?: number;
  /**
   * Factor to increase the delay between retries.
   *
   * @default 1.25
   */
  retryDelayFactor?: number;
  /**
   * A function that determines whether a response should be retried.
   * If the upstream returns `Retry-After` header, the response will be retried.
   * By default, it retries on network errors, rate limiting, and non-original GraphQL errors.
   */
  shouldRetry?: (payload: ShouldRetryPayload) => boolean;
}

interface ShouldRetryPayload {
  executionRequest: ExecutionRequest;
  executionResult: MaybeAsyncIterable<ExecutionResult>;
  response?: Response;
}

export interface UpstreamRetryPayload {
  subgraphName: string;
  executionRequest: ExecutionRequest;
}

export type UpstreamRetryPluginOptions =
  | UpstreamRetryOptions
  | ((payload: UpstreamRetryPayload) => UpstreamRetryOptions | undefined);

export function useUpstreamRetry<TContext extends Record<string, any>>(
  opts: UpstreamRetryPluginOptions,
): GatewayPlugin<TContext> {
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const retryOptions = typeof opts === 'function' ? opts : () => opts;
  const executionRequestResponseMap = new WeakMap<ExecutionRequest, Response>();
  return {
    onSubgraphExecute({
      subgraphName,
      executionRequest,
      executor,
      setExecutor,
    }) {
      const optsForReq = retryOptions({ subgraphName, executionRequest });
      if (optsForReq) {
        const {
          maxRetries,
          retryDelay = 1000,
          retryDelayFactor = 1.25,
          shouldRetry = ({ response, executionResult }) => {
            if (response) {
              // If network error or rate limited, retry
              if (
                response.status >= 500 ||
                response.status === 429 ||
                response.headers.get('Retry-After')
              ) {
                return true;
              }
            }
            // If there are errors that are not original GraphQL errors, retry
            if (
              !isAsyncIterable(executionResult) &&
              executionResult.errors?.length &&
              !executionResult.errors.some(isOriginalGraphQLError)
            ) {
              return true;
            }
            return false;
          },
        } = optsForReq;
        if (maxRetries > 0) {
          setExecutor(function (executionRequest: ExecutionRequest) {
            let retries = maxRetries + 1;
            let executionResult: MaybeAsyncIterable<ExecutionResult>;
            let currRetryDelay = retryDelay;
            function retry(): MaybePromise<
              MaybeAsyncIterable<ExecutionResult>
            > {
              retries--;
              try {
                if (retries < 0) {
                  return executionResult;
                }
                const requestTime = Date.now();
                return mapMaybePromise(
                  executor(executionRequest),
                  (currRes) => {
                    executionResult = currRes;
                    let retryAfterSecondsFromHeader: number | undefined;
                    const response =
                      executionRequestResponseMap.get(executionRequest);
                    const retryAfterHeader =
                      response?.headers.get('Retry-After');
                    if (retryAfterHeader) {
                      retryAfterSecondsFromHeader =
                        parseInt(retryAfterHeader) * 1000;
                      if (isNaN(retryAfterSecondsFromHeader)) {
                        const dateTime = new Date(retryAfterHeader).getTime();
                        if (!isNaN(dateTime)) {
                          retryAfterSecondsFromHeader = dateTime - requestTime;
                        }
                      }
                    }
                    currRetryDelay =
                      retryAfterSecondsFromHeader ||
                      currRetryDelay * retryDelayFactor;
                    if (
                      shouldRetry({
                        executionRequest,
                        executionResult,
                        response,
                      })
                    ) {
                      return new Promise((resolve) => {
                        const timeout = setTimeout(() => {
                          timeouts.delete(timeout);
                          resolve(retry());
                        }, currRetryDelay);
                        timeouts.add(timeout);
                      });
                    }
                    return currRes;
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
          });
        }
      }
    },
    onFetch({ executionRequest }) {
      if (executionRequest) {
        return function onFetchDone({ response }) {
          executionRequestResponseMap.set(executionRequest, response);
        };
      }
      return undefined;
    },
    [DisposableSymbols.dispose]() {
      for (const timeout of timeouts) {
        clearTimeout(timeout);
        timeouts.delete(timeout);
      }
    },
  };
}
