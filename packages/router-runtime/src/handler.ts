import { QueryPlan } from '@graphql-hive/router-query-planner';
import {
  handleFederationSupergraph,
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { createDefaultExecutor } from '@graphql-mesh/transport-common';
import { getTypeInfo } from '@graphql-tools/delegate';
import { defaultPrintFn } from '@graphql-tools/executor-common';
import {
  getRngFromEnv,
} from '@graphql-tools/federation';
import {
  ExecutionRequest,
  ExecutionResult,
  getDirectiveExtensions,
  isAsyncIterable,
  memoize2,
} from '@graphql-tools/utils';
import {
  handleMaybePromise,
  mapAsyncIterator,
  MaybePromise,
} from '@whatwg-node/promise-helpers';
import {
  BREAK,
  buildSchema,
  DocumentNode,
  GraphQLSchema,
  visit,
  visitWithTypeInfo,
} from 'graphql';
import { executeQueryPlan } from './executor';
import { queryPlanForExecutionRequestContext } from './utils';

export async function unifiedGraphHandler(
  opts: UnifiedGraphHandlerOpts,
): Promise<UnifiedGraphHandlerResult> {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs
  const { unifiedGraph, getSubschema, inContextSDK } =
    handleFederationSupergraph(opts);

  const moduleName = '@graphql-hive/router-query-planner';
  const { QueryPlanner }: typeof import('@graphql-hive/router-query-planner') =
    await import(moduleName);
  const supergraphSdl = opts.getUnifiedGraphSDL();
  const queryPlanner = new QueryPlanner(supergraphSdl);

  function getActivePercentLabels(percentageValue: number) {
    const activePercentLabels = new Set<string>();
    for (const percentage of queryPlanner.overridePercentages) {
      if (percentageValue > percentage) {
        activePercentLabels.add(`percent(${percentage})`);
      }
    }
    return activePercentLabels;
  }

  const defaultExecutor = createDefaultExecutor(unifiedGraph);

  function calculateCacheKeyForDocument(
    activeLabels: Set<string>,
    percentageValue: number,
    operationName?: string,
  ) {
    let cacheKey = operationName || '';
    for (const label of activeLabels) {
      cacheKey += `|${label}`;
    }
    const activePercentLabels = getActivePercentLabels(percentageValue);
    for (const label of activePercentLabels) {
      cacheKey += `|${label}`;
    }
    return cacheKey;
  }

  const documentOperationPlanCache = new WeakMap<
    DocumentNode,
    Map<string | null, MaybePromise<QueryPlan>>
  >();
  function planDocument(executionRequest: ExecutionRequest) {
    let operationCache = documentOperationPlanCache.get(
      executionRequest.document,
    );
    const activeLabels = new Set<string>();
    for (const label of queryPlanner.overrideLabels) {
      if (opts.handleProgressiveOverride?.(label, executionRequest.context)) {
        activeLabels.add(label);
      }
    }
    const rng = getRngFromEnv() || Math.random();
    const percentageValue = rng * 100;
    const cacheKey = calculateCacheKeyForDocument(
      activeLabels,
      percentageValue,
      executionRequest.operationName,
    );

    // we dont need to worry about releasing values. the map values in weakmap
    // will all be released when document node is GCed
    if (operationCache) {
      const plan = operationCache.get(cacheKey);
      if (plan) {
        return plan;
      }
    } else {
      operationCache = new Map<string, MaybePromise<QueryPlan>>();
      documentOperationPlanCache.set(executionRequest.document, operationCache);
    }

    const plan = handleMaybePromise(
      () =>
        queryPlanner.planAsync(
          defaultPrintFn(executionRequest.document),
          executionRequest.operationName,
          activeLabels,
          percentageValue,
          executionRequest.signal,
        ),
      (queryPlan) => {
        operationCache.set(cacheKey, queryPlan);
        return queryPlan;
      },
    );
    operationCache.set(cacheKey, plan);
    return plan;
  }

  return {
    unifiedGraph,
    getSubgraphSchema(subgraphName: string) {
      return getSubschema(subgraphName).schema;
    },
    executor(executionRequest) {
      if (isDefaultExecute(unifiedGraph, executionRequest.document)) {
        return defaultExecutor(executionRequest);
      }
      return handleMaybePromise(
        () => planDocument(executionRequest),
        (queryPlan) => {
          queryPlanForExecutionRequestContext.set(
            // setter like getter
            executionRequest.context || executionRequest.document,
            queryPlan,
          );
          return executeQueryPlan({
            supergraphSchema: unifiedGraph,
            executionRequest,
            onSubgraphExecute(subgraphName, executionRequest) {
              const subschema = getSubschema(subgraphName);
              if (subschema.transforms?.length) {
                const transforms = subschema.transforms;
                const transformationContext = Object.create(null);
                for (const transform of transforms) {
                  if (transform.transformRequest) {
                    executionRequest = transform.transformRequest(
                      executionRequest,
                      undefined as any,
                      transformationContext,
                    );
                  }
                }
                return handleMaybePromise(
                  () => opts.onSubgraphExecute(subgraphName, executionRequest),
                  (executionResult) => {
                    function handleResult(executionResult: ExecutionResult) {
                      for (const transform of transforms.toReversed()) {
                        if (transform.transformResult) {
                          executionResult = transform.transformResult(
                            executionResult,
                            undefined as any,
                            transformationContext,
                          );
                        }
                      }
                      return executionResult;
                    }
                    if (isAsyncIterable(executionResult)) {
                      return mapAsyncIterator(executionResult, (result) =>
                        handleResult(result),
                      );
                    }
                    return handleResult(executionResult);
                  },
                );
              }
              return opts.onSubgraphExecute(subgraphName, executionRequest);
            },
            queryPlan,
          });
        },
      );
    },
    overrideLabels: queryPlanner.overrideLabels,
    inContextSDK,
  };
}

const directivesForDefaultExecute = new Set([
  'resolveTo',
  'additionalField',
  'pubsubOperation',
  'pubsubPublish',
]);

/**
 * Decides if the query is an introspection query by:
 * - checking if it contains __schema or __type fields or;
 * - checking if it only queries for __typename fields on the Query type.
 */
const isDefaultExecute = memoize2(function isDefaultExecute(
  supergraphSchema: GraphQLSchema,
  document: DocumentNode,
): boolean {
  let onlyQueryTypenameFields = false;
  let containsIntrospectionField = false;
  let containsDefaultExecuteDirective = false;
  const typeInfo = getTypeInfo(supergraphSchema);
  visit(
    document,
    visitWithTypeInfo(typeInfo, {
      Field(node) {
        const fieldName = node.name.value;
        if (fieldName === '__schema' || fieldName === '__type') {
          containsIntrospectionField = true;
          return BREAK;
        }
        if (fieldName === '__typename') {
          onlyQueryTypenameFields = true;
          return node;
        } else {
          onlyQueryTypenameFields = false;
        }
        const fieldDef = typeInfo.getFieldDef();
        if (fieldDef) {
          const directives = getDirectiveExtensions(fieldDef, supergraphSchema);
          for (const directiveName of directivesForDefaultExecute) {
            if (directives[directiveName]?.length) {
              containsDefaultExecuteDirective = true;
              return BREAK;
            }
          }
        }
        return;
      },
    }),
  );
  return (
    containsIntrospectionField ||
    onlyQueryTypenameFields ||
    containsDefaultExecuteDirective
  );
});
