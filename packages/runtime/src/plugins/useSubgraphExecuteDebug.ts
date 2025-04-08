import { defaultPrintFn } from '@graphql-mesh/transport-common';
import { FetchAPI, isAsyncIterable } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export function useSubgraphExecuteDebug<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  let fetchAPI: FetchAPI;
  return {
    onYogaInit({ yoga }) {
      fetchAPI = yoga.fetchAPI;
    },
    onSubgraphExecute({ executionRequest }) {
      const log = executionRequest.context?.log.child({
        subgraphExecuteId: fetchAPI.crypto.randomUUID(),
      });
      if (!log) {
        throw new Error('Logger is not available in the execution context');
      }
      log.debug(() => {
        const logData: Record<string, any> = {};
        if (executionRequest.document) {
          logData['query'] = defaultPrintFn(executionRequest.document);
        }
        if (
          executionRequest.variables &&
          Object.keys(executionRequest.variables).length
        ) {
          logData['variables'] = executionRequest.variables;
        }
        return logData;
      }, 'subgraph-execute-start');
      const start = performance.now();
      return function onSubgraphExecuteDone({ result }) {
        if (isAsyncIterable(result)) {
          return {
            onNext({ result }) {
              log.debug(result, 'subgraph-execute-next');
            },
            onEnd() {
              log.debug(
                () => ({
                  duration: performance.now() - start,
                }),
                'subgraph-execute-end',
              );
            },
          };
        }
        log.debug(result, 'subgraph-execute-done');
        return void 0;
      };
    },
  };
}
