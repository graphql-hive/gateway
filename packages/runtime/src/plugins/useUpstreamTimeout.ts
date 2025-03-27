import { abortSignalAny } from '@graphql-hive/signal';
import { subgraphNameByExecutionRequest } from '@graphql-mesh/fusion-runtime';
import { UpstreamErrorExtensions } from '@graphql-mesh/transport-common';
import { getHeadersObj } from '@graphql-mesh/utils';
import {
  createDeferred,
  createGraphQLError,
  ExecutionRequest,
  ExecutionResult,
  isAsyncIterable,
  isPromise,
} from '@graphql-tools/utils';
import { GatewayPlugin } from '../types';

export interface TimeoutFactoryPayload {
  subgraphName?: string;
  executionRequest?: ExecutionRequest;
}

export type UpstreamTimeoutPluginOptions =
  | number
  | ((payload: TimeoutFactoryPayload) => number | undefined);

export function useUpstreamTimeout<TContext extends Record<string, any>>(
  opts: UpstreamTimeoutPluginOptions,
): GatewayPlugin<TContext> {
  const timeoutFactory = typeof opts === 'function' ? opts : () => opts;
  const timeoutSignalsByExecutionRequest = new WeakMap<
    ExecutionRequest,
    AbortSignal
  >();
  const errorExtensionsByExecRequest = new WeakMap<
    ExecutionRequest,
    UpstreamErrorExtensions
  >();
  return {
    onSubgraphExecute({
      subgraphName,
      executionRequest,
      executor,
      setExecutor,
    }) {
      const timeout = timeoutFactory({ subgraphName, executionRequest });
      if (timeout) {
        setExecutor(function timeoutExecutor(
          executionRequest: ExecutionRequest,
        ) {
          let timeoutSignal =
            timeoutSignalsByExecutionRequest.get(executionRequest);
          if (!timeoutSignal) {
            timeoutSignal = AbortSignal.timeout(timeout);
            timeoutSignalsByExecutionRequest.set(
              executionRequest,
              timeoutSignal,
            );
          }
          const signals: AbortSignal[] = [];
          signals.push(timeoutSignal);
          if (executionRequest.signal) {
            signals.push(executionRequest.signal);
          }
          const timeoutDeferred = createDeferred<ExecutionResult>();
          function rejectDeferred() {
            timeoutDeferred.reject(timeoutSignal?.reason);
          }
          timeoutSignal.addEventListener('abort', rejectDeferred, {
            once: true,
          });
          executionRequest.signal = abortSignalAny(signals);
          const res$ = executor(executionRequest);
          if (!isPromise(res$)) {
            return res$;
          }
          return Promise.race([timeoutDeferred.promise, res$])
            .then((result) => {
              if (isAsyncIterable(result)) {
                return {
                  [Symbol.asyncIterator]() {
                    const iterator = result[Symbol.asyncIterator]();
                    if (iterator.return) {
                      timeoutSignal.addEventListener(
                        'abort',
                        () => {
                          iterator.return?.(timeoutSignal.reason);
                        },
                        {
                          once: true,
                        },
                      );
                    }
                    return iterator;
                  },
                };
              }
              return result;
            })
            .catch((e) => {
              if (e === timeoutSignal.reason) {
                const upstreamErrorExtensions =
                  errorExtensionsByExecRequest.get(executionRequest);
                throw createGraphQLError(e.message, {
                  extensions: {
                    ...upstreamErrorExtensions,
                    code: 'TIMEOUT_ERROR',
                    http: {
                      status: 504,
                    },
                  },
                });
              }
              throw e;
            })
            .finally(() => {
              timeoutDeferred.resolve(undefined as any);
              timeoutSignal.removeEventListener('abort', rejectDeferred);
              // Remove from the map after used so we don't see it again
              errorExtensionsByExecRequest.delete(executionRequest);
              timeoutSignalsByExecutionRequest.delete(executionRequest);
            });
        });
      }
      return undefined;
    },
    onFetch({ url, executionRequest, options, setOptions }) {
      const subgraphName =
        executionRequest &&
        subgraphNameByExecutionRequest.get(executionRequest);
      if (
        !executionRequest ||
        !timeoutSignalsByExecutionRequest.has(executionRequest)
      ) {
        const timeout = timeoutFactory({ subgraphName, executionRequest });
        if (timeout) {
          let timeoutSignal: AbortSignal | undefined;
          if (executionRequest) {
            timeoutSignal =
              timeoutSignalsByExecutionRequest.get(executionRequest);
            if (!timeoutSignal) {
              timeoutSignal = AbortSignal.timeout(timeout);
              timeoutSignalsByExecutionRequest.set(
                executionRequest,
                timeoutSignal,
              );
            }
          } else {
            timeoutSignal = AbortSignal.timeout(timeout);
          }
          const signals: AbortSignal[] = [];
          signals.push(timeoutSignal);
          if (options.signal) {
            signals.push(options.signal);
          }
          setOptions({
            ...options,
            signal: abortSignalAny(signals),
          });
        }
      }
      if (executionRequest) {
        const upstreamErrorExtensions: UpstreamErrorExtensions = {
          serviceName: subgraphName,
          request: {
            url,
            method: options.method,
            body: options.body,
          },
        };
        errorExtensionsByExecRequest.set(
          executionRequest,
          upstreamErrorExtensions,
        );
        return function onFetchDone({ response }) {
          timeoutSignalsByExecutionRequest.delete(executionRequest);
          upstreamErrorExtensions.response = {
            status: response.status,
            statusText: response.statusText,
            headers: getHeadersObj(response.headers),
          };
        };
      }
      return undefined;
    },
  };
}
