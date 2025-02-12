import { defaultPrintFn } from '@graphql-mesh/transport-common';
import type { Logger } from '@graphql-mesh/types';
import { FetchAPI, isAsyncIterable } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export function useSubgraphExecuteDebug<
  TContext extends Record<string, any>,
>(opts: { logger: Logger }): GatewayPlugin<TContext> {
  let fetchAPI: FetchAPI;
  return {
    onYogaInit({ yoga }) {
      fetchAPI = yoga.fetchAPI;
    },
    onSubgraphExecute({ executionRequest, logger = opts.logger }) {
      const subgraphExecuteId = fetchAPI.crypto.randomUUID();
      const subgraphExecuteHookLogger = logger.child({
        subgraphExecuteId,
      });
      if (executionRequest) {
        const subgraphExecuteStartLogger = subgraphExecuteHookLogger.child(
          'subgraph-execute-start',
        );
        subgraphExecuteStartLogger.debug(() => {
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
        });
      }
      const start = performance.now();
      return function onSubgraphExecuteDone({ result }) {
        const subgraphExecuteEndLogger = subgraphExecuteHookLogger.child(
          'subgraph-execute-end',
        );
        if (isAsyncIterable(result)) {
          return {
            onNext({ result }) {
              const subgraphExecuteNextLogger = subgraphExecuteHookLogger.child(
                'subgraph-execute-next',
              );
              subgraphExecuteNextLogger.debug(result);
            },
            onEnd() {
              subgraphExecuteEndLogger.debug(() => ({
                duration: performance.now() - start,
              }));
            },
          };
        }
        subgraphExecuteEndLogger.debug(() => ({
          result,
          duration: performance.now() - start,
        }));
        return void 0;
      };
    },
  };
}
