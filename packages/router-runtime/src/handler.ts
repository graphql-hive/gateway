import { createHash } from 'node:crypto';
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
import type { ExecutionRequest, ExecutionResult } from '@graphql-tools/utils';
import {
  handleMaybePromise,
  isPromise,
  MaybePromise,
} from '@whatwg-node/promise-helpers';
import { BREAK, DocumentNode, visit } from 'graphql';
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
  getLazyFactory,
  getLazyValue,
  handleMaybePromiseMaybeAsyncIterable,
  onSubgraphExecuteWithTransforms,
  queryPlanForExecutionRequestContext,
} from './utils';

function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

/** Query plans only depend on the supergraph and the operation, so they're safe to keep for a while. */
const QUERY_PLAN_CACHE_TTL_SECONDS = 60 * 60 * 24;

function cacheQueryPlan(
  cache: NonNullable<UnifiedGraphHandlerOpts['cache']>,
  key: string,
  queryPlan: QueryPlan,
  log: UnifiedGraphHandlerOpts['log'],
) {
  const logCacheSetError = (err: unknown) => {
    log?.debug({ err, key }, 'Unable to cache query plan');
  };
  try {
    const result = cache.set(key, queryPlan, {
      ttl: QUERY_PLAN_CACHE_TTL_SECONDS,
    });
    if (isPromise(result)) {
      result.then(() => {}, logCacheSetError);
    }
  } catch (err) {
    logCacheSetError(err);
  }
}

export async function unifiedGraphHandler(
  opts: UnifiedGraphHandlerOpts,
): Promise<UnifiedGraphHandlerResult> {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs
  const getSubschema = getLazyFactory(
    () => getHandledFederationSupergraph().getSubschema,
  );
  const getHandledFederationSupergraph = getLazyValue(() =>
    handleFederationSupergraph(opts),
  );

  const moduleName = '@graphql-hive/router-query-planner';
  const { QueryPlanner }: typeof import('@graphql-hive/router-query-planner') =
    await import(moduleName);
  const supergraphSdl = opts.getUnifiedGraphSDL();
  const queryPlanner = new QueryPlanner(supergraphSdl);
  const entityResolutionMap = getEntityResolutionMap(opts.unifiedGraph);
  const pubsubOperationMetadataMap = getPubsubOperationRootFields(
    opts.unifiedGraph,
    entityResolutionMap,
  );
  const pubsubPublishMetadataMap = getPubsubPublishMetadata(
    opts.unifiedGraph,
    entityResolutionMap,
  );
  const supergraphSchema = filterInternalFieldsAndTypes(opts.unifiedGraph);
  const defaultExecutor = getLazyFactory(() =>
    createDefaultExecutor(supergraphSchema),
  );

  // Scoping the key by the supergraph itself means a schema reload (or a
  // redeploy pointing at a new supergraph) naturally stops reusing old plans,
  // without needing to explicitly invalidate anything in the shared cache.
  const remotePlanCacheKeyPrefix = opts.cache
    ? `hive-gateway:query-plan:${sha256(supergraphSdl)}:`
    : undefined;

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
    const printedDocument = defaultPrintFn(executionRequest.document);
    const cacheKey = queryPlanner.computeCacheKey(
      printedDocument,
      executionRequest.operationName,
      activeLabels,
      percentageValue,
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


    function computePlan() {
      return queryPlanner.planAsync(
        printedDocument,
        executionRequest.operationName,
        activeLabels,
        percentageValue,
        executionRequest.signal,
      );
    }

    const plan = handleMaybePromise(
      () => {
        if (!opts.cache || !remotePlanCacheKeyPrefix) {
          return computePlan();
        }
        const cache = opts.cache;
        const remoteKey = remotePlanCacheKeyPrefix + cacheKey;
        return handleMaybePromise(
          () => cache.get(remoteKey),
          (cachedPlan) =>
            cachedPlan ??
            handleMaybePromise(computePlan, (queryPlan) => {
              cacheQueryPlan(cache, remoteKey, queryPlan, opts.log);
              return queryPlan;
            }),
          (err) => {
            opts.log?.debug(
              { err, key: remoteKey },
              'Unable to read cached query plan, computing it instead',
            );
            return computePlan();
          },
        );
      },
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
            supergraphSchema,
            executionRequest,
            onSubgraphExecute: (subgraphName, executionRequest) =>
              handlePubsubOperationField(
                supergraphSchema,
                addEntityResolutionFieldsForPubsubPublish(
                  supergraphSchema,
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
                        supergraphSchema,
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
