import {
  handleFederationSupergraph,
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { createDefaultExecutor } from '@graphql-mesh/transport-common';
import { defaultPrintFn } from '@graphql-tools/executor-common';
import { filterInternalFieldsAndTypes } from '@graphql-tools/federation';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { BREAK, DocumentNode, visit } from 'graphql';
import { executeQueryPlan } from './executor';
import { getLazyFactory, getLazyValue, memoize1Promise } from './utils';

export function unifiedGraphHandler(
  opts: UnifiedGraphHandlerOpts,
): UnifiedGraphHandlerResult {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs
  const getSubgraphSchema = getLazyFactory(
    () => handleFederationSupergraph(opts).getSubgraphSchema,
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
  const planDocument = memoize1Promise((document: DocumentNode) =>
    handleMaybePromise(getQueryPlanner, (qp) =>
      qp.plan(defaultPrintFn(document)).then((queryPlan) => queryPlan),
    ),
  );
  return {
    unifiedGraph: supergraphSchema,
    getSubgraphSchema,
    executor(executionRequest) {
      if (isIntrospection(executionRequest.document)) {
        return defaultExecutor(executionRequest);
      }
      return handleMaybePromise(
        () => planDocument(executionRequest.document),
        (queryPlan) =>
          executeQueryPlan({
            supergraphSchema,
            executionRequest,
            onSubgraphExecute: opts.onSubgraphExecute,
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
