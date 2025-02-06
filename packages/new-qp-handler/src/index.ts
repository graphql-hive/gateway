import { Supergraph, buildSchemaFromAST, operationFromDocument } from "@apollo/federation-internals";
import { QueryPlanner } from "@apollo/query-planner";
import { executeQueryPlan } from "@graphql-hive/query-plan-executor";
import type { UnifiedGraphHandlerOpts, UnifiedGraphHandlerResult } from "@graphql-mesh/fusion-runtime";
import { ExecutionRequest, ExecutionResult, getDocumentNodeFromSchema, MaybeAsyncIterable, MaybePromise, memoize1 } from "@graphql-tools/utils";
import { DocumentNode } from "graphql";

export function handleSupergraphWithQueryPlanner(opts: UnifiedGraphHandlerOpts): UnifiedGraphHandlerResult {
    const queryPlanner = new QueryPlanner(new Supergraph(buildSchemaFromAST(getDocumentNodeFromSchema(opts.unifiedGraph))), {
        // Query Planner handles AST parsing
        exposeDocumentNodeInFetchNode: true,
        // Query Plan caching
        // @ts-expect-error - Promise typings...
        cache: opts.cache,
    });

    const unifiedGraph = queryPlanner.supergraph.apiSchema().toGraphQLJSSchema();

    // Memoization that would work with parse caching
    const buildQueryPlan = memoize1(function buildQueryPlan(document: DocumentNode) {
        const operationForQp = operationFromDocument(queryPlanner.supergraph.schema, document);
        const queryPlan = queryPlanner.buildQueryPlan(operationForQp);
        return queryPlan;
    });

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
            variables,
            operationName,
            context,
        }: ExecutionRequest): MaybePromise<MaybeAsyncIterable<ExecutionResult>> {
            const queryPlan = buildQueryPlan(document);
            return executeQueryPlan({
                supergraphSchema: unifiedGraph,
                document,
                operationName,
                variables,
                context,
                onSubgraphExecute: opts.onSubgraphExecute,
                queryPlan: queryPlan as any,
            })
        },
        inContextSDK: {},
    }
}