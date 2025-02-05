import { Supergraph, buildSchemaFromAST, operationFromDocument } from "@apollo/federation-internals";
import { QueryPlanner } from "@apollo/query-planner";
import { executeQueryPlan } from "@graphql-hive/query-plan-executor";
import type { UnifiedGraphHandlerOpts, UnifiedGraphHandlerResult } from "@graphql-mesh/fusion-runtime";
import { ExecutionRequest, ExecutionResult, getDocumentNodeFromSchema, MaybePromise } from "@graphql-tools/utils";
import { parseWithCache } from '@graphql-mesh/utils';

export function handleSupergraphWithQueryPlanner(opts: UnifiedGraphHandlerOpts): UnifiedGraphHandlerResult {
    const queryPlanner = new QueryPlanner(
        new Supergraph(
            buildSchemaFromAST(
                getDocumentNodeFromSchema(opts.unifiedGraph),
                { validate: false }
            )
        )
    );

    const unifiedGraph = queryPlanner.supergraph.apiSchema().toGraphQLJSSchema();

    return {
        unifiedGraph,
        getSubgraphSchema(subgraphName) {
            const subgraphQp = queryPlanner.supergraph.subgraphs().get(subgraphName);
            if (!subgraphQp) {
                throw new Error(`Subgraph ${subgraphName} not found`);
            }
            return subgraphQp.schema.toGraphQLJSSchema();
        },
        executor({
            document,
            variables = {},
            operationName,
        }: ExecutionRequest): MaybePromise<ExecutionResult> {
            const operationForQp = operationFromDocument(queryPlanner.supergraph.schema, document, { operationName });
            const queryPlan = queryPlanner.buildQueryPlan(operationForQp);
            return executeQueryPlan({
                supergraphSchema: unifiedGraph,
                document,
                operationName,
                variables,
                getSubgraphExecutor(subgraphName) {
                    return function subgraphExecutor(executionRequest) {
                        return opts.onSubgraphExecute(subgraphName, executionRequest);
                    };
                },
                parseDocumentNode: parseWithCache,
                queryPlan: queryPlan as any,
            })
        },
        inContextSDK: {},
    }
}