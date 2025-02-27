import { EMPTY_OBJECT } from '@graphql-tools/delegate';
import {
  createGraphQLError,
  isAsyncIterable,
  mapAsyncIterator,
} from '@graphql-tools/utils';
import { GatewayPlugin } from '../types';
import { createCalculateCost } from './demand-control/calculateCost';

export interface DemandControlPluginOptions {
  /**
   * The assumed maximum size of a list for fields that return lists.
   */
  defaultAssumedListSize?: number;
  /**
   * 	The maximum cost of an accepted operation. An operation with a higher cost than this is rejected.
   *  If not provided, no maximum cost is enforced.
   */
  max?: number;
  /**
   * Whether to show the estimated cost in the extensions of the response.
   * @default false
   */
  showInformationInExtensions?: boolean;
}

export function useDemandControl<TContext extends Record<string, any>>({
  defaultAssumedListSize,
  max,
  showInformationInExtensions,
}: DemandControlPluginOptions): GatewayPlugin<TContext> {
  const calculateCost = createCalculateCost(defaultAssumedListSize);
  const costByContextMap = new WeakMap<any, number>();
  return {
    onSubgraphExecute({ subgraph, executionRequest, logger }) {
      const demandControlLogger = logger?.child('demand-control');
      let costByContext = executionRequest.context
        ? costByContextMap.get(executionRequest.context) || 0
        : 0;
      const operationCost = calculateCost(
        subgraph,
        executionRequest.document,
        executionRequest.variables || EMPTY_OBJECT,
      );
      costByContext += operationCost;
      if (executionRequest.context) {
        costByContextMap.set(executionRequest.context, costByContext);
      }
      demandControlLogger?.debug({
        operationCost,
        totalCost: costByContext,
      });
      if (max != null && costByContext > max) {
        throw createGraphQLError(
          `Operation estimated cost ${costByContext} exceeded configured maximum ${max}`,
          {
            extensions: {
              code: 'COST_ESTIMATED_TOO_EXPENSIVE',
              cost: {
                estimated: costByContext,
                max,
              },
            },
          },
        );
      }
    },
    onExecutionResult({ result, setResult, context }) {
      if (showInformationInExtensions) {
        const costByContext = costByContextMap.get(context);
        if (costByContext) {
          if (isAsyncIterable(result)) {
            setResult(
              mapAsyncIterator(result, (value) => ({
                ...value,
                extensions: {
                  ...(value.extensions || {}),
                  cost: {
                    estimated: costByContext,
                    max,
                  },
                },
              })),
            );
          } else {
            setResult({
              ...(result || {}),
              extensions: {
                ...(result?.extensions || {}),
                cost: {
                  estimated: costByContext,
                  max,
                },
              },
            });
          }
          costByContextMap.delete(context);
        }
      }
    },
  };
}
