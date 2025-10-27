import { QueryPlanner } from '@graphql-hive/router';
import {
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import { memoize1, printSchemaWithDirectives } from '@graphql-tools/utils';
import {
  buildSchema,
  DocumentNode,
  GraphQLSchema,
  print,
  printSchema,
} from 'graphql';
import { handleFederationSupergraph } from '../federation/supergraph';
import { executeQueryPlan } from './executor';

export function handleFederationSupergraphWithRouter(
  opts: UnifiedGraphHandlerOpts,
): UnifiedGraphHandlerResult {
  // TODO: should we do it this way? we only need the tools handler to pluck out the subgraphs
  const { getSubgraphSchema } = handleFederationSupergraph(opts);
  const supergraphSchema = opts.unifiedGraph;
  const qp = new QueryPlanner(printSchemaWithDirectives(supergraphSchema));
  const plan = memoize1(function plan(document: DocumentNode) {
    return qp.plan(print(document));
  });
  return {
    unifiedGraph: buildAndRemoveIntrospectionFields(qp.consumerSchema),
    getSubgraphSchema,
    executor: ({ document, variables, operationName, context }) =>
      plan(document).then((queryPlan) =>
        executeQueryPlan({
          supergraphSchema,
          document,
          operationName,
          variables,
          context,
          onSubgraphExecute: opts.onSubgraphExecute,
          queryPlan,
        }),
      ),
    inContextSDK: {
      // TODO: do we need/want an SDK here?
    },
  };
}

function buildAndRemoveIntrospectionFields(schemaSdl: string): GraphQLSchema {
  // we print a built schema because print will remove introspection types
  let saneSchemaSdl = printSchema(
    buildSchema(schemaSdl, { assumeValid: true }),
  );

  // introspection fields in the query type will stay, remove them manually
  saneSchemaSdl = saneSchemaSdl.replace('__schema: __Schema!', '');
  saneSchemaSdl = saneSchemaSdl.replace('__type(name: String!): __Type', '');

  return buildSchema(saneSchemaSdl, { assumeValid: true });
}
