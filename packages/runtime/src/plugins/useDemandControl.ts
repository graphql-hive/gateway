import { EMPTY_OBJECT } from '@graphql-tools/delegate';
import {
  createGraphQLError,
  isAsyncIterable,
  mapAsyncIterator,
} from '@graphql-tools/utils';
import { getNodeEnv } from '~internal/env';
import {
  FieldNode,
  GraphQLNamedOutputType,
  isCompositeType,
  OperationTypeNode,
  TypeInfo,
} from 'graphql';
import { GatewayPlugin } from '../types';
import { createCalculateCost } from './demand-control/calculateCost';

export interface DemandControlPluginOptions {
  /**
   * 	The maximum cost of an accepted operation. An operation with a higher cost than this is rejected.
   *  If not provided, no maximum cost is enforced.
   *  @default Infinity
   */
  maxCost?: number;
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
  operationTypeCost?(operationType: OperationTypeNode): number;
  /**
   * Cost based on a field
   * It is called for each field in the operation, and overrides the `@cost` directive.
   */
  fieldCost?(fieldNode: FieldNode, typeInfo: TypeInfo): number;
  /**
   * Cost based on a type
   * It is called for return types of fields in the operation, and overrides the `@cost` directive.
   *
   * @default ((type) => isCompositeType(type) ? 1 : 0)
   */
  typeCost?(type: GraphQLNamedOutputType): number;
  /**
   * Include extension values that provide useful information, such as the estimated cost of the operation.
   * Defaults to `true` if `env.NODE_ENV` is set to `"development"`, otherwise `false`.
   */
  includeExtensionMetadata?: boolean;
}

export function useDemandControl<TContext extends Record<string, any>>({
  listSize = 0,
  maxCost,
  includeExtensionMetadata = getNodeEnv() === 'development',
  operationTypeCost = (operationType) =>
    operationType === 'mutation' ? 10 : 0,
  fieldCost,
  typeCost = (type) => (isCompositeType(type) ? 1 : 0),
}: DemandControlPluginOptions): GatewayPlugin<TContext> {
  const calculateCost = createCalculateCost({
    listSize,
    operationTypeCost,
    fieldCost,
    typeCost,
  });
  const costByContextMap = new WeakMap<any, number>();
  return {
    onSubgraphExecute({ subgraph, executionRequest, log }) {
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
      log.debug(
        {
          operationCost,
          totalCost: costByContext,
        },
        '[useDemandControl]',
      );
      if (maxCost != null && costByContext > maxCost) {
        throw createGraphQLError(
          `Operation estimated cost ${costByContext} exceeded configured maximum ${maxCost}`,
          {
            extensions: {
              code: 'COST_ESTIMATED_TOO_EXPENSIVE',
              cost: {
                estimated: costByContext,
                max: maxCost,
              },
            },
          },
        );
      }
    },
    onExecutionResult({ result, setResult, context }) {
      if (includeExtensionMetadata) {
        const costByContext = costByContextMap.get(context) || 0;
        if (isAsyncIterable(result)) {
          setResult(
            mapAsyncIterator(result, (value) => ({
              ...value,
              extensions: {
                ...(value.extensions || {}),
                cost: {
                  estimated: costByContext,
                  max: maxCost,
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
                max: maxCost,
              },
            },
          });
        }
      }
    },
  };
}
