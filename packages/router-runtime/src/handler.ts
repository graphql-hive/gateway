import { QueryPlan } from '@graphql-hive/router-query-planner';
import {
  handleFederationSupergraph,
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { createDefaultExecutor } from '@graphql-mesh/transport-common';
import { defaultPrintFn } from '@graphql-tools/executor-common';
import {
  getRngFromEnv,
} from '@graphql-tools/federation';
import {
  ExecutionRequest,
  ExecutionResult,
  getDefinedRootType,
  getDirectiveExtensions,
  isAsyncIterable,
  memoize2,
} from '@graphql-tools/utils';
import {
  handleMaybePromise,
  mapAsyncIterator,
  MaybePromise,
} from '@whatwg-node/promise-helpers';
import { BREAK, DocumentNode, GraphQLSchema, visit } from 'graphql';
import { executeQueryPlan } from './executor';
import { queryPlanForExecutionRequestContext } from './utils';

export async function unifiedGraphHandler(
  opts: UnifiedGraphHandlerOpts,
): Promise<UnifiedGraphHandlerResult> {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs
  const handledFederationSupergraph = handleFederationSupergraph(opts);

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

  const defaultExecutor = createDefaultExecutor(handledFederationSupergraph.unifiedGraph);

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
    unifiedGraph: handledFederationSupergraph.unifiedGraph,
    getSubgraphSchema(subgraphName: string) {
      return handledFederationSupergraph.getSubschema(subgraphName).schema;
    },
    executor(executionRequest) {
      const { defaultExecute, pubsubPublish } = shouldExecuteWithDefaultExecution(handledFederationSupergraph.unifiedGraph, executionRequest.document);
      if (defaultExecute) {
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
          return handleMaybePromise(() => executeQueryPlan({
            supergraphSchema: handledFederationSupergraph.unifiedGraph,
            executionRequest,
            onSubgraphExecute(subgraphName, executionRequest) {
              const subschema = handledFederationSupergraph.getSubschema(subgraphName);
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
          }), result => {
            if (pubsubPublish.length > 0) {
              function handleResult(result: ExecutionResult) {
                for (const pubsubPublishEntry of pubsubPublish) {
                  if (result.data && pubsubPublishEntry.responseKey in result.data) {
                    const payload = result.data[pubsubPublishEntry.responseKey];
                    executionRequest.context?.['pubsub']?.publish(
                      pubsubPublishEntry.pubsubTopic,
                      payload,
                    );
                  }
                }
                return result;
              }
              if (isAsyncIterable(result)) {
                return mapAsyncIterator(result, result => handleResult(result));
              }
              return handleResult(result);
            }
            return result;
          });
        },
      );
    },
    overrideLabels: queryPlanner.overrideLabels,
    inContextSDK: handledFederationSupergraph.inContextSDK,
  };
}

/**
 * Decides if the query is an introspection query by:
 * - checking if it contains __schema or __type fields or;
 * - checking if it only queries for __typename fields on the Query type.
 */
const shouldExecuteWithDefaultExecution = memoize2(
  function shouldExecuteWithDefaultExecution(
    schema: GraphQLSchema,
    document: DocumentNode
  ) {
    let onlyQueryTypenameFields = false;
    let containsIntrospectionField = false;
    let containsAdditionalField = false;
    const pubsubPublish: {
      fieldName: string;
      responseKey: string;
      pubsubTopic: string;
    }[] = [];
    visit(document, {
      OperationDefinition(node) {
        for (const sel of node.selectionSet.selections) {
          if (sel.kind !== 'Field') return BREAK;
          const fieldName = sel.name.value;
          if (fieldName === '__schema' || sel.name.value === '__type') {
            containsIntrospectionField = true;
          }
          if (fieldName === '__typename') {
            onlyQueryTypenameFields = true;
          } else {
            onlyQueryTypenameFields = false;
            const operationType = node.operation;
            const parentType = getDefinedRootType(schema, operationType);
            const fieldDef = parentType.getFields()[fieldName];
            if (fieldDef) {
              const fieldDirectives = getDirectiveExtensions(fieldDef, schema);
              if (fieldDirectives?.['resolveTo']?.length || fieldDirectives?.['additionalField']?.length) {
                containsAdditionalField = true;
              }
              if (fieldDirectives?.['pubsubPublish']?.length) {
                for (const pubsubDirective of fieldDirectives['pubsubPublish']) {
                  const pubsubTopic = pubsubDirective['pubsubTopic'];
                  if (typeof pubsubTopic === 'string') {
                    pubsubPublish.push({
                      fieldName,
                      responseKey: sel.alias ? sel.alias.value : fieldName,
                      pubsubTopic,
                    });
                  }
                }
              }
            }
          }
        }
        return;
      },
    });
    return {
      defaultExecute: containsIntrospectionField || onlyQueryTypenameFields || containsAdditionalField,
      pubsubPublish
    };
  }
)

