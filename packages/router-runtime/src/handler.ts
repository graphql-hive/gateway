import { QueryPlan } from '@graphql-hive/router-query-planner';
import {
  handleFederationSupergraph,
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { createDefaultExecutor } from '@graphql-mesh/transport-common';
import { defaultPrintFn } from '@graphql-tools/executor-common';
import {
  filterInternalFieldsAndTypes,
  getRngFromEnv,
} from '@graphql-tools/federation';
import {
  ExecutionRequest,
  ExecutionResult,
  isAsyncIterable,
} from '@graphql-tools/utils';
import {
  handleMaybePromise,
  mapAsyncIterator,
  MaybePromise,
} from '@whatwg-node/promise-helpers';
import { BREAK, DocumentNode, visit } from 'graphql';
import { executeQueryPlan } from './executor';
import { getLazyFactory, queryPlanForExecutionRequestContext } from './utils';

export async function unifiedGraphHandler(
  opts: UnifiedGraphHandlerOpts,
): Promise<UnifiedGraphHandlerResult> {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs
  const getSubschema = getLazyFactory(
    () => handleFederationSupergraph(opts).getSubschema,
  );

  const moduleName = '@graphql-hive/router-query-planner';
  const { QueryPlanner }: typeof import('@graphql-hive/router-query-planner') =
    await import(moduleName);
  const supergraphSdl = opts.getUnifiedGraphSDL();
  const queryPlanner = new QueryPlanner(supergraphSdl);

  const overrideLabels = queryPlanner.overrideLabels;
  const overridePercentages = queryPlanner.overridePercentages;

  function getActivePercentLabels(percentageValue: number) {
    const activePercentLabels = new Set<string>();
    for (const percentage of overridePercentages) {
      if (percentageValue > percentage) {
        activePercentLabels.add(`percent(${percentage})`);
      }
    }
    return activePercentLabels;
  }

  const supergraphSchema = filterInternalFieldsAndTypes(opts.unifiedGraph);
  const defaultExecutor = getLazyFactory(() =>
    createDefaultExecutor(supergraphSchema),
  );

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
    for (const label of overrideLabels) {
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
        queryPlanner.plan(
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
    unifiedGraph: supergraphSchema,
    getSubgraphSchema(subgraphName: string) {
      return getSubschema(subgraphName).schema;
    },
    executor(executionRequest) {
      if (isIntrospection(executionRequest.document)) {
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
            supergraphSchema,
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
    overrideLabels,
  };
}

/**
 * Decides if the query is an introspection query by:
 * - checking if it contains __schema or __type fields or;
 * - checking if it only queries for __typename fields on the Query type.
 */
function isIntrospection(document: DocumentNode): boolean {
  let onlyQueryTypenameFields = false;
  let containsIntrospectionField = false;
  visit(document, {
    OperationDefinition(node) {
      for (const sel of node.selectionSet.selections) {
        if (sel.kind !== 'Field') return BREAK;
        if (sel.name.value === '__schema' || sel.name.value === '__type') {
          containsIntrospectionField = true;
          return BREAK;
        }
        if (sel.name.value === '__typename') {
          onlyQueryTypenameFields = true;
        } else {
          onlyQueryTypenameFields = false;
          return BREAK;
        }
      }
      return;
    },
  });
  return containsIntrospectionField || onlyQueryTypenameFields;
}
