import { defaultPrintFn } from '@graphql-mesh/transport-common';
import type { Logger } from '@graphql-mesh/types';
import { isAsyncIterable } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';
import { generateUUID } from '../utils';

export function useSubgraphExecuteDebug<
  TContext extends Record<string, any>,
>(opts: { logger: Logger }): GatewayPlugin<TContext> {
  return {
    onSubgraphExecute({ executionRequest, logger = opts.logger }) {
      const subgraphExecuteId = generateUUID();
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
              logger.debug('next', () => ({
                subgraphExecuteId,
                result: JSON.stringify(result, null, '  '),
              }));
            },
            onEnd() {
              logger.debug('end', () => ({
                subgraphExecuteId,
              }));
            },
          };
        }
        logger.debug('result', () => ({
          subgraphExecuteId,
          result: JSON.stringify(result, null, '  '),
        }));
        return void 0;
      };
    },
  };
}
