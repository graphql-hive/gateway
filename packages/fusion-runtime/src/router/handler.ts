import { QueryPlanner } from '@graphql-hive/router';
import {
  type UnifiedGraphHandlerOpts,
  type UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import {
  ExecutionResult,
  memoize1,
  printSchemaWithDirectives,
} from '@graphql-tools/utils';
import {
  BREAK,
  buildSchema,
  DocumentNode,
  execute,
  GraphQLSchema,
  print,
  printSchema,
  visit,
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
  const consumerSchema = buildAndRemoveIntrospectionFields(qp.consumerSchema);
  return {
    unifiedGraph: consumerSchema,
    getSubgraphSchema,
    executor({ document, variables, operationName, context }) {
      if (containsIntrospectionFields(document)) {
        // TODO: handle introspection fields with data fields where also the query planner needs to run
        return execute({
          schema: consumerSchema,
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

function containsIntrospectionFields(document: DocumentNode): boolean {
  let containsIntrospectionField = false;
  visit(document, {
    Field(node) {
      if (node.name.value === '__schema' || node.name.value === '__type') {
        containsIntrospectionField = true;
        return BREAK;
      }
    },
  });
  return containsIntrospectionField;
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
