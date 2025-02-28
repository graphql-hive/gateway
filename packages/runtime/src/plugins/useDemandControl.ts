import { process } from '@graphql-mesh/cross-helpers';
import { EMPTY_OBJECT } from '@graphql-tools/delegate';
import {
  createGraphQLError,
  isAsyncIterable,
  mapAsyncIterator,
} from '@graphql-tools/utils';
import { OperationTypeNode } from 'graphql';
import { GatewayPlugin } from '../types';
import { createCalculateCost } from './demand-control/calculateCost';

export interface DemandControlPluginOptions {
  /**
   * 	The maximum cost of an accepted operation. An operation with a higher cost than this is rejected.
   *  If not provided, no maximum cost is enforced.
   *  @default Infinity
   */
  max?: number;
  /**
   * The assumed maximum size of a list for fields that return lists.
   * @default 0
   */
  listSize?: number;
  /**
   * Cost based on the operation type.
   * By default, mutations have a cost of 10, queries and subscriptions have a cost of 0.
   * @default ((operationType) => operationType === 'mutation' ? 10 : 0)
   */
  operationTypeCost(operationType: OperationTypeNode): number;
  /**
   * Include extension values that provide useful information, such as the estimated cost of the operation.
   * Defaults to `true` if `process.env["NODE_ENV"]` is set to `"development"`, otherwise `false`.
   */
  includeExtensionMetadata?: boolean;
}

export function defaultOperationTypeCost(
  operationType: OperationTypeNode,
): number {
  return operationType === 'mutation' ? 10 : 0;
}

export function useDemandControl<TContext extends Record<string, any>>({
  listSize = 0,
  max,
  includeExtensionMetadata = process.env.NODE_ENV === 'development',
  operationTypeCost = defaultOperationTypeCost,
}: DemandControlPluginOptions): GatewayPlugin<TContext> {
  const calculateCost = createCalculateCost({
    listSize,
    operationTypeCost,
  });
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
      if (includeExtensionMetadata) {
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
        }
      }
    },
  };
}
