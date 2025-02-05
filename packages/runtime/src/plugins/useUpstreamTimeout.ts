import { subgraphNameByExecutionRequest } from '@graphql-mesh/fusion-runtime';
import { UpstreamErrorExtensions } from '@graphql-mesh/transport-common';
import { getHeadersObj } from '@graphql-mesh/utils';
import {
  createDeferred,
  createGraphQLError,
  ExecutionRequest,
  ExecutionResult,
  isAsyncIterable,
  MaybeAsyncIterable,
  MaybePromise,
  registerAbortSignalListener,
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
            // Comment the line above
            // And uncomment the line below to see that statement leaks specificaly
            // timeoutSignal = { addEventListener() {} } as AbortSignal;
            timeoutSignalsByExecutionRequest.set(
              executionRequest,
              timeoutSignal,
            );
          }
          const timeoutDeferred = createDeferred<void>();
          function rejectDeferred() {
            timeoutDeferred.reject(timeoutSignal?.reason);
          }
          timeoutSignal.addEventListener('abort', rejectDeferred, {
            once: true,
          });
          const signals: AbortSignal[] = [];
          signals.push(timeoutSignal);
          if (executionRequest.signal) {
            signals.push(executionRequest.signal);
          }
          return Promise.race([
            timeoutDeferred.promise,
            executor({
              ...executionRequest,
              signal: AbortSignal.any(signals),
            }),
          ])
            .then((result) => {
              if (isAsyncIterable(result)) {
                return {
                  [Symbol.asyncIterator]() {
                    const iterator = result[Symbol.asyncIterator]();
                    if (iterator.return) {
                      registerAbortSignalListener(timeoutSignal, () =>
                        iterator.return?.(timeoutSignal.reason),
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
                  originalError: e,
                  extensions: upstreamErrorExtensions,
                });
              }
              throw e;
            })
            .finally(() => {
              timeoutDeferred.resolve();
              timeoutSignal.removeEventListener('abort', rejectDeferred);
              // Remove from the map after used so we don't see it again
              errorExtensionsByExecRequest.delete(executionRequest);
              timeoutSignalsByExecutionRequest.delete(executionRequest);
            }) as MaybePromise<MaybeAsyncIterable<ExecutionResult>>;
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
            signal: AbortSignal.any(signals),
          });
        }
      }
      if (executionRequest) {
        const upstreamErrorExtensions: UpstreamErrorExtensions = {
          subgraph: subgraphName,
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
