import { EMPTY_OBJECT } from '@graphql-tools/delegate';
import {
  createGraphQLError,
  ExecutionRequest,
  isAsyncIterable,
  mapAsyncIterator,
  MaybePromise,
} from '@graphql-tools/utils';
import { getNodeEnv } from '~internal/env';
import {
  FieldNode,
  GraphQLNamedOutputType,
  isCompositeType,
  OperationTypeNode,
  TypeInfo,
} from 'graphql';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { GatewayPlugin } from '../types';
import { createCalculateCost } from './demand-control/calculateCost';

export interface DemandControlMaxCostPayload {
  /**
   * The estimated cost of the current subgraph operation.
   */
  operationCost: number;
  /**
   * The total estimated cost accumulated for the whole request context so far.
   */
  totalCost: number;
  /**
   * The name of the subgraph being executed.
   */
  subgraphName: string;
  /**
   * The execution request being processed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executionRequest: ExecutionRequest<any, any>;
}

export interface DemandControlPluginOptions {
  /**
   * The maximum cost of an accepted operation. An operation with a higher cost than this is rejected.
   * Can be a static number or a function (sync or async) that receives cost details and returns the
   * maximum cost allowed. Use a function to implement dynamic cost limits based on the context,
   * subgraph, or estimated cost.
   * If not provided, no maximum cost is enforced.
   * @default Infinity
   */
  maxCost?: number | ((payload: DemandControlMaxCostPayload) => MaybePromise<number>);
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
  const maxCostFn =
    maxCost == null
      ? null
      : typeof maxCost === 'function'
        ? maxCost
        : () => maxCost;
  const costByContextMap = new WeakMap<any, number>();
  const resolvedMaxCostByContextMap = new WeakMap<any, number>();
  return {
    onSubgraphExecute({ subgraph, subgraphName, executionRequest, log }) {
      if (!subgraph) {
        return;
      }
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
      if (maxCostFn != null) {
        return handleMaybePromise(
          () =>
            maxCostFn({
              operationCost,
              totalCost: costByContext,
              subgraphName,
              executionRequest,
            }),
          (resolvedMaxCost) => {
            if (executionRequest.context) {
              resolvedMaxCostByContextMap.set(
                executionRequest.context,
                resolvedMaxCost,
              );
            }
            if (costByContext > resolvedMaxCost) {
              throw createGraphQLError(
                `Operation estimated cost ${costByContext} exceeded configured maximum ${resolvedMaxCost}`,
                {
                  extensions: {
                    code: 'COST_ESTIMATED_TOO_EXPENSIVE',
                    cost: {
                      estimated: costByContext,
                      max: resolvedMaxCost,
                    },
                  },
                },
              );
            }
          },
        );
      }
    },
    onExecutionResult({ result, setResult, context }) {
      if (includeExtensionMetadata) {
        const costByContext = costByContextMap.get(context) || 0;
        const resolvedMaxCost = resolvedMaxCostByContextMap.get(context);
        if (isAsyncIterable(result)) {
          setResult(
            mapAsyncIterator(result, (value) => ({
              ...value,
              extensions: {
                ...(value.extensions || {}),
                cost: {
                  estimated: costByContext,
                  ...(resolvedMaxCost != null ? { max: resolvedMaxCost } : {}),
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
                ...(resolvedMaxCost != null ? { max: resolvedMaxCost } : {}),
              },
            },
          });
        }
      }
    },
  };
}
