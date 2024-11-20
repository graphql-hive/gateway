import { defaultPrintFn } from '@graphql-mesh/transport-common';
import type { Logger } from '@graphql-mesh/types';
import { crypto } from '@whatwg-node/fetch';
import { isAsyncIterable } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export function useSubgraphExecuteDebug<
  TContext extends Record<string, any>,
>(opts: { logger: Logger }): GatewayPlugin<TContext> {
  return {
    onSubgraphExecute({ executionRequest, logger = opts.logger }) {
      const subgraphExecuteId = crypto.randomUUID();
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
              logger.debug(`next`, () => ({
                subgraphExecuteId,
                result: JSON.stringify(result),
              }));
            },
            onEnd() {
              logger.debug(`end`, () => ({
                subgraphExecuteId,
              }));
            },
          };
        }
        logger.debug('result', () => ({
          subgraphExecuteId,
          result: JSON.stringify(result),
        }));
        return void 0;
      };
    },
  };
}
