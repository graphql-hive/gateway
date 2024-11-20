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
      logger = logger.child('subgraph-execute');
      if (executionRequest) {
        logger.debug('start', () =>
          JSON.stringify(
            {
              subgraphExecuteId,
              query:
                executionRequest.document &&
                defaultPrintFn(executionRequest.document),
              variables: executionRequest.variables,
            },
            null,
            '  ',
          ),
        );
      }
      return function onSubgraphExecuteDone({ result }) {
        if (isAsyncIterable(result)) {
          return {
            onNext({ result }) {
              logger.debug('next', () =>
                JSON.stringify(
                  {
                    subgraphExecuteId,
                    result,
                  },
                  null,
                  '  ',
                ),
              );
            },
            onEnd() {
              logger.debug('end', () => ({
                subgraphExecuteId,
              }));
            },
          };
        }
        logger.debug('result', () =>
          JSON.stringify(
            {
              subgraphExecuteId,
              result,
            },
            null,
            '  ',
          ),
        );
        return void 0;
      };
    },
  };
}
