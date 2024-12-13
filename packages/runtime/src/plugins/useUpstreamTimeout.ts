import { subgraphNameByExecutionRequest } from '@graphql-mesh/fusion-runtime';
import { UpstreamErrorExtensions } from '@graphql-mesh/transport-common';
import { getHeadersObj } from '@graphql-mesh/utils';
import {
  createGraphQLError,
  ExecutionRequest,
  ExecutionResult,
  isAsyncIterable,
  MaybeAsyncIterable,
  MaybePromise,
} from '@graphql-tools/utils';
import { abortSignalAny, isAbortSignalFromAny } from 'abort-signal-any';
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
        let timeoutSignal =
          timeoutSignalsByExecutionRequest.get(executionRequest);
        if (!timeoutSignal) {
          timeoutSignal = AbortSignal.timeout(timeout);
          timeoutSignalsByExecutionRequest.set(executionRequest, timeoutSignal);
        }
        timeoutSignalsByExecutionRequest.set(executionRequest, timeoutSignal);
        const timeout$ = new Promise((_, reject) => {
          if (timeoutSignal.aborted) {
            reject(timeoutSignal.reason);
          }
          timeoutSignal.addEventListener('abort', () =>
            reject(timeoutSignal.reason),
          );
        });
        if (isAbortSignalFromAny(executionRequest.signal)) {
          executionRequest.signal.addSignals([timeoutSignal]);
        } else {
          const signals = [timeoutSignal];
          if (executionRequest.signal) {
            signals.push(executionRequest.signal);
          }
          executionRequest.signal = abortSignalAny(signals);
        }
        setExecutor(function timeoutExecutor(
          executionRequest: ExecutionRequest,
        ) {
          return Promise.race([timeout$, executor(executionRequest)])
            .then((result) => {
              if (isAsyncIterable(result)) {
                const iterator = result[Symbol.asyncIterator]();
                timeoutSignal.addEventListener('abort', () =>
                  iterator.return?.(timeoutSignal.reason),
                );
                return {
                  [Symbol.asyncIterator]() {
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
                return {
                  errors: [
                    createGraphQLError(e.message, {
                      extensions: upstreamErrorExtensions,
                    }),
                  ],
                };
              }
              throw e;
            }) as MaybePromise<MaybeAsyncIterable<ExecutionResult>>;
        });
      }
      return undefined;
    },
    onFetch({ url, executionRequest, options }) {
      const subgraphName =
        executionRequest &&
        subgraphNameByExecutionRequest.get(executionRequest);
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
          timeoutSignalsByExecutionRequest.set(executionRequest, timeoutSignal);
        } else {
          timeoutSignal = AbortSignal.timeout(timeout);
        }
        if (isAbortSignalFromAny(options.signal)) {
          options.signal.addSignals([timeoutSignal]);
        } else {
          const signals = [timeoutSignal];
          if (options.signal) {
            signals.push(options.signal);
          }
          options.signal = abortSignalAny(signals);
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
          response: {},
        };
        errorExtensionsByExecRequest.set(
          executionRequest,
          upstreamErrorExtensions,
        );
        return function onFetchDone({ response }) {
          upstreamErrorExtensions.response = {
            status: response.status,
            statusText: response.statusText,
            headers: getHeadersObj(response.headers),
            body: response.body,
          };
        };
      }
      return undefined;
    },
  };
}
