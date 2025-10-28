import { QueryPlanner } from '@graphql-hive/router';
import {
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { filterInternalFieldsAndTypes } from '@graphql-tools/federation';
import {
  ExecutionResult,
  memoize1,
  printSchemaWithDirectives,
} from '@graphql-tools/utils';
import { BREAK, DocumentNode, execute, print, visit } from 'graphql';
import { handleFederationSupergraph } from '../federation/supergraph';
import { executeQueryPlan } from './executor';

export function handleFederationSupergraphWithRouter(
  opts: UnifiedGraphHandlerOpts,
): UnifiedGraphHandlerResult {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs
  const { getSubgraphSchema } = handleFederationSupergraph(opts);
  const qp = new QueryPlanner(printSchemaWithDirectives(opts.unifiedGraph));
  const plan = memoize1(function plan(document: DocumentNode) {
    return qp.plan(print(document));
  });
  const supergraphSchema = filterInternalFieldsAndTypes(opts.unifiedGraph);
  return {
    unifiedGraph: supergraphSchema,
    getSubgraphSchema,
    executor({ document, variables, operationName, context }) {
      if (isIntrospection(document)) {
        // TODO: handle introspection fields with data fields where also the query planner needs to run
        return execute({
          schema: supergraphSchema,
          document,
          variableValues: variables,
          operationName,
          contextValue: context,
        }) as ExecutionResult<any>; // TODO: graphql-js ExecutionResult uses `unknown` data and return and therefore fails
      }
      return plan(document).then((queryPlan) =>
        executeQueryPlan({
          supergraphSchema,
          document,
          operationName,
          variables,
          context,
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
