import {
  buildSchemaFromAST,
  operationFromDocument,
  Supergraph,
} from '@apollo/federation-internals';
import { QueryPlanner as ApolloQueryPlanner } from '@apollo/query-planner';
import { executeQueryPlan } from '@graphql-hive/query-plan-executor';
import type {
  UnifiedGraphHandlerOpts,
  UnifiedGraphHandlerResult,
} from '@graphql-mesh/fusion-runtime';
import {
  ExecutionRequest,
  getDocumentNodeFromSchema,
  memoize1,
  printSchemaWithDirectives,
} from '@graphql-tools/utils';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { QueryPlanner as HiveQueryPlanner } from '/Users/enisdenjo/Develop/src/github.com/graphql-hive/router/lib/node-addon';
import { getEnvBool, getEnvStr } from '~internal/env';
import { DocumentNode, print } from 'graphql';

const isHiveQp = getEnvStr('QUERY_PLANNER') === 'hive';

export function handleSupergraphWithQueryPlanner(
  opts: UnifiedGraphHandlerOpts,
): UnifiedGraphHandlerResult {
  // TODO: the hive query planner is a quick and dirty implementation

  const hiveQueryPlanner = new HiveQueryPlanner(
    printSchemaWithDirectives(opts.unifiedGraph),
  );
  const apolloQueryPlanner = new ApolloQueryPlanner(
    new Supergraph(
      buildSchemaFromAST(getDocumentNodeFromSchema(opts.unifiedGraph)),
    ),
    {
      incrementalDelivery: {
        enableDefer: true,
      },
      // Query Planner handles AST parsing
      exposeDocumentNodeInFetchNode: true,
      // Query Plan caching
      // @ts-expect-error - Promise typings...
      cache: opts.cache,
    },
  );

  const unifiedGraph = apolloQueryPlanner.supergraph
    .apiSchema()
    .toGraphQLJSSchema();

  // Memoization that would work with parse caching
  const buildApolloQueryPlan = function buildApolloQueryPlan(
    document: DocumentNode,
  ) {
    const operationForQp = operationFromDocument(
      apolloQueryPlanner.supergraph.schema,
      document,
    );
    const queryPlan = apolloQueryPlanner.buildQueryPlan(operationForQp);
    return queryPlan;
  };
  const hiveQueryPlan = function hiveQueryPlan(document: DocumentNode) {
    return hiveQueryPlanner.plan(print(document));
  };

  return {
    unifiedGraph,
    getSubgraphSchema(subgraphName) {
      const subgraphQp = apolloQueryPlanner.supergraph
        .subgraphs()
        .get(subgraphName);
      if (!subgraphQp) {
        throw new Error(`Subgraph ${subgraphName} not found`);
      }
      return subgraphQp.schema.toGraphQLJSSchema();
    },
    executor({
      document,
      variables,
      operationName,
      context,
    }: ExecutionRequest) {
      if (isHiveQp) {
        return hiveQueryPlan(document).then(
          (queryPlan) =>
            executeQueryPlan({
              supergraphSchema: unifiedGraph,
              document,
              operationName,
              variables,
              context,
              onSubgraphExecute: opts.onSubgraphExecute,
              queryPlan: queryPlan as any,
            }) as any,
        );
      }
      const queryPlan = buildApolloQueryPlan(document);
      const res = executeQueryPlan({
        supergraphSchema: unifiedGraph,
        document,
        operationName,
        variables,
        context,
        onSubgraphExecute: opts.onSubgraphExecute,
        queryPlan: queryPlan as any,
      });
      return res as any;
    },
    inContextSDK: {},
  };
}
