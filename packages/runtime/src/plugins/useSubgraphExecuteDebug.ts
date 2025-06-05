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
      const log = executionRequest.context?.log.child(
        {
          subgraphExecuteId: fetchAPI.crypto.randomUUID(),
        },
        '[useSubgraphExecuteDebug] ',
      );
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
      }, 'Start');
      const start = performance.now();
      return function onSubgraphExecuteDone({ result }) {
        if (isAsyncIterable(result)) {
          return {
            onNext({ result }) {
              log.debug(result, 'Next');
            },
            onEnd() {
              log.debug(
                () => ({
                  duration: performance.now() - start,
                }),
                'End',
              );
            },
          };
        }
        log.debug(result, 'Done');
        return void 0;
      };
    },
  };
}
