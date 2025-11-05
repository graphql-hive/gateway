import { QueryPlan, QueryPlanner } from '@graphql-hive/router';
import {
  handleFederationSupergraph,
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { defaultPrintFn } from '@graphql-tools/executor-common';
import { filterInternalFieldsAndTypes } from '@graphql-tools/federation';
import { Executor } from '@graphql-tools/utils';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';
import { BREAK, DocumentNode, GraphQLSchema, visit } from 'graphql';
import { executeQueryPlan } from './executor';
import { createDefaultExecutor } from '@graphql-mesh/transport-common';

export function unifiedGraphHandler(
  opts: UnifiedGraphHandlerOpts,
): UnifiedGraphHandlerResult {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs
  let _getSubgraphSchema: (subgraphName: string) => GraphQLSchema;
  function getSubgraphSchema(subgraphName: string): GraphQLSchema {
    _getSubgraphSchema = handleFederationSupergraph(opts).getSubgraphSchema;
    return _getSubgraphSchema(subgraphName);
  }
  let _defaultExecutor: Executor;
  function getDefaultExecutor(): Executor {
    _defaultExecutor = createDefaultExecutor(opts.unifiedGraph);
    return _defaultExecutor;
  }
  const unifiedGraphSdl = opts.getUnifiedGraphSDL();
  const qp = new QueryPlanner(unifiedGraphSdl);

  const planByDocument = new WeakMap<DocumentNode, MaybePromise<QueryPlan>>();

  const supergraphSchema = filterInternalFieldsAndTypes(opts.unifiedGraph);
  return {
    unifiedGraph: supergraphSchema,
    getSubgraphSchema,
    executor(executionRequest) {
      if (isIntrospection(executionRequest.document)) {
        return getDefaultExecutor()(executionRequest);
      }
      return handleMaybePromise(
        () => {
          let queryPlan = planByDocument.get(executionRequest.document);
          if (!queryPlan) {
            const documentStr = defaultPrintFn(executionRequest.document);
            queryPlan = qp
              .plan(documentStr, executionRequest.operationName)
              .then((resolvedQueryPlan) => {
                queryPlan = resolvedQueryPlan;
                // Set the plan in the map after it's fully resolved to avoid multiple concurrent resolutions
                planByDocument.set(executionRequest.document, queryPlan);
                return queryPlan;
              });
            planByDocument.set(executionRequest.document, queryPlan);
          }
          return queryPlan;
        },
        (queryPlan) =>
          executeQueryPlan({
            supergraphSchema,
            executionRequest,
            onSubgraphExecute: opts.onSubgraphExecute,
            queryPlan,
          }),
      );
    },
    inContextSDK: {
      // TODO: do we need/want an SDK here?
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
    // @ts-expect-error we dont have to return anything aside from break
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
    },
  });
  return containsIntrospectionField || onlyQueryTypenameFields;
}
