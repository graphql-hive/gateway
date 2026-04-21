import { QueryPlan } from '@graphql-hive/router-query-planner';
import {
  handleFederationSupergraph,
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { createDefaultExecutor } from '@graphql-mesh/transport-common';
import { getTypeInfo } from '@graphql-tools/delegate';
import { defaultPrintFn } from '@graphql-tools/executor-common';
import { getRngFromEnv } from '@graphql-tools/federation';
import {
  getDirectiveExtensions,
  IResolvers,
  memoize3,
  type ExecutionRequest,
  type ExecutionResult,
} from '@graphql-tools/utils';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';
import {
  BREAK,
  DocumentNode,
  GraphQLSchema,
  TypeNameMetaFieldDef,
  visit,
  visitWithTypeInfo,
} from 'graphql';
import { executeQueryPlan } from './executor';
import {
  addEntityResolutionFieldsForPubsubPublish,
  getEntityResolutionMap,
  getPubsubOperationRootFields,
  getPubsubPublishMetadata,
  handlePubsubOperationField,
  handleResultWithPubSubPublish,
} from './pubsubDirectives';
import {
  handleMaybePromiseMaybeAsyncIterable,
  onSubgraphExecuteWithTransforms,
  queryPlanForExecutionRequestContext,
} from './utils';

export async function unifiedGraphHandler(
  opts: UnifiedGraphHandlerOpts,
): Promise<UnifiedGraphHandlerResult> {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs

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

  const entityResolutionMap = getEntityResolutionMap(opts.unifiedGraph);
  const pubsubOperationMetadataMap = getPubsubOperationRootFields(
    opts.unifiedGraph,
    entityResolutionMap,
  );
  const pubsubPublishMetadataMap = getPubsubPublishMetadata(
    opts.unifiedGraph,
    entityResolutionMap,
  );
  const { getSubschema, unifiedGraph, inContextSDK, additionalResolvers } =
    handleFederationSupergraph(opts);
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
      if (
        isDefaultExecution(
          unifiedGraph,
          executionRequest.document,
          additionalResolvers,
        )
      ) {
        return defaultExecutor(executionRequest);
      }
      // Prepare pubsub metadata for this request
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
            onSubgraphExecute: (subgraphName, executionRequest) =>
              handlePubsubOperationField(
                unifiedGraph,
                addEntityResolutionFieldsForPubsubPublish(
                  unifiedGraph,
                  executionRequest,
                  subgraphName,
                  pubsubPublishMetadataMap,
                ),
                pubsubOperationMetadataMap,
                (executionRequest) =>
                  handleMaybePromiseMaybeAsyncIterable(
                    () =>
                      onSubgraphExecuteWithTransforms(
                        subgraphName,
                        executionRequest,
                        opts.onSubgraphExecute,
                        getSubschema,
                      ),
                    (executionResult: ExecutionResult) =>
                      handleResultWithPubSubPublish(
                        unifiedGraph,
                        pubsubPublishMetadataMap,
                        executionRequest,
                        executionResult,
                      ),
                  ),
              ),
            queryPlan,
          });
        },
      );
    },
    overrideLabels: queryPlanner.overrideLabels,
    inContextSDK,
  };
}

/**
 * Decides if the query should be executed with the default executor by:
 * - checking if it contains __schema or __type fields or;
 * - checking if it only queries for __typename fields on the Query type.
 * - checking if there is an additional type definition
 */
const isDefaultExecution = memoize3(function isDefaultExecutionFn(
  schema: GraphQLSchema,
  document: DocumentNode,
  additionalResolvers: IResolvers[],
): boolean {
  const typeInfo = getTypeInfo(schema);
  let onlyQueryTypenameFields = false;
  let containsIntrospectionField = false;
  let containsAdditionalDef = false;
  visit(
    document,
    visitWithTypeInfo(typeInfo, {
      Field(node) {
        const fieldDef = typeInfo.getFieldDef();
        if (fieldDef) {
          if (fieldDef === TypeNameMetaFieldDef) {
            onlyQueryTypenameFields = true;
          } else {
            onlyQueryTypenameFields = false;
            if (fieldDef.name === '__schema' || fieldDef.name === '__type') {
              containsIntrospectionField = true;
              return BREAK;
            }
          }
          const directives = getDirectiveExtensions(fieldDef, schema);
          if (directives['additionalField'] || directives['resolveTo']) {
            containsAdditionalDef = true;
            return BREAK;
          }
        }
        const typeDef = typeInfo.getParentType();
        if (typeDef) {
          for (const additionalResolverObj of additionalResolvers) {
            const typeResolvers = additionalResolverObj[typeDef.name];
            if (typeResolvers) {
              // @ts-expect-error - we know it is there
              const fieldResolver = typeResolvers[node.name.value];
              if (fieldResolver) {
                containsAdditionalDef = true;
                return BREAK;
              }
            }
          }
        }
        return node;
      },
    }),
  );
  return (
    containsIntrospectionField ||
    onlyQueryTypenameFields ||
    containsAdditionalDef
  );
});
