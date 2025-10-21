import { QueryPlanner } from '@graphql-hive/router';
import type {
  UnifiedGraphHandlerOpts,
  UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { memoize1, printSchemaWithDirectives } from '@graphql-tools/utils';
import { DocumentNode, GraphQLSchema, print } from 'graphql';
import { executeQueryPlan } from './executor';

export function handleFederationSupergraphWithRouter(
  opts: UnifiedGraphHandlerOpts,
): UnifiedGraphHandlerResult {
  const unifiedGraph = opts.unifiedGraph;
  const qp = new QueryPlanner(printSchemaWithDirectives(unifiedGraph));
  const plan = memoize1(function plan(document: DocumentNode) {
    const queryPlan = qp.plan(print(document));
    return queryPlan;
  });
  return {
    unifiedGraph,
    getSubgraphSchema(subgraphName) {
      const subgraphSchema: GraphQLSchema | undefined = undefined;
      if (!subgraphSchema) {
        throw new Error(`Subgraph ${subgraphName} not found`);
      }
      return subgraphSchema;
    },
    executor({ document, variables, operationName, context }) {
      return plan(document).then((queryPlan) =>
        executeQueryPlan({
          supergraphSchema: unifiedGraph,
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
