import { QueryPlan } from '@graphql-hive/router-query-planner';
import {
  handleFederationSupergraph,
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { createDefaultExecutor } from '@graphql-mesh/transport-common';
import { defaultPrintFn } from '@graphql-tools/executor-common';
import { filterInternalFieldsAndTypes } from '@graphql-tools/federation';
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
import { getLazyFactory, getLazyValue } from './utils';
import { wrapQueryPlanFnWithHooks } from './wrapQueryPlanFnWithHooks';

export function unifiedGraphHandler(
  opts: UnifiedGraphHandlerOpts,
): UnifiedGraphHandlerResult {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs
  const getSubschema = getLazyFactory(
    () => handleFederationSupergraph(opts).getSubschema,
  );

  const getQueryPlanner = getLazyValue(() => {
    const moduleName = '@graphql-hive/router-query-planner';
    const supergraphSdl = opts.getUnifiedGraphSDL();
    return import(moduleName).then(
      ({ QueryPlanner }: typeof import('@graphql-hive/router-query-planner')) =>
        new QueryPlanner(supergraphSdl),
    );
  });

  const supergraphSchema = filterInternalFieldsAndTypes(opts.unifiedGraph);
  const defaultExecutor = getLazyFactory(() =>
    createDefaultExecutor(supergraphSchema),
  );

  const documentOperationPlanCache = new WeakMap<
    DocumentNode,
    Map<string | null, MaybePromise<QueryPlan>>
  >();
  function defaultQueryPlanFn({
    document,
    operationName,
  }: ExecutionRequest): MaybePromise<QueryPlan> {
    let operationCache = documentOperationPlanCache.get(document);

    // we dont need to worry about releasing values. the map values in weakmap
    // will all be released when document node is GCed
    const operationNameKey = operationName || null;
    if (operationCache) {
      const plan = operationCache.get(operationNameKey);
      if (plan) {
        return plan;
      }
    } else {
      operationCache = new Map<string, MaybePromise<QueryPlan>>();
      documentOperationPlanCache.set(document, operationCache);
    }

    const plan = handleMaybePromise(getQueryPlanner, (qp) =>
      qp.plan(defaultPrintFn(document), operationName).then((queryPlan) => {
        operationCache.set(operationNameKey, queryPlan);
        return queryPlan;
      }),
    );
    operationCache.set(operationNameKey, plan);
    return plan;
  }

  const wrappedQueryPlanFn = opts.onQueryPlanHooks?.length
    ? wrapQueryPlanFnWithHooks(defaultQueryPlanFn, opts.onQueryPlanHooks)
    : defaultQueryPlanFn;

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
        () => wrappedQueryPlanFn(executionRequest),
        (queryPlan) =>
          executeQueryPlan({
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
          }),
      );
    },
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
