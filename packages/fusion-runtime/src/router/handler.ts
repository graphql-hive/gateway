import { QueryPlanner } from '@graphql-hive/router';
import {
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { memoize1, printSchemaWithDirectives } from '@graphql-tools/utils';
import { buildSchema, DocumentNode, print } from 'graphql';
import { handleFederationSupergraph } from '../federation/supergraph';
import { executeQueryPlan } from './executor';

export function handleFederationSupergraphWithRouter(
  opts: UnifiedGraphHandlerOpts,
): UnifiedGraphHandlerResult {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs
  const { getSubgraphSchema } = handleFederationSupergraph(opts);

  const supergraphSchema = opts.unifiedGraph;
  const qp = new QueryPlanner(printSchemaWithDirectives(supergraphSchema));
  const consumerSchemaSdl = qp.consumerSchema;
  const plan = memoize1(function plan(document: DocumentNode) {
    return qp.plan(print(document));
  });
  return {
    unifiedGraph: buildSchema(consumerSchemaSdl),
    getSubgraphSchema,
    executor({ document, variables, operationName, context }) {
      return plan(document).then((queryPlan) => {
        return executeQueryPlan({
          supergraphSchema,
          document,
          operationName,
          variables,
          context,
          onSubgraphExecute: opts.onSubgraphExecute,
          queryPlan,
        });
      });
    },
    inContextSDK: {
      // TODO: do we need/want an SDK here?
    },
  };
}
