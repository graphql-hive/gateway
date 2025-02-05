import type { Executor } from "@graphql-tools/utils";
import type { GraphQLSchema, OperationDefinitionNode, FragmentDefinitionNode, GraphQLError, DocumentNode } from "graphql";

export interface QueryPlanExecutionContext {
  /**
   * The public schema of the supergraph
   */
  supergraphSchema: GraphQLSchema;
  /**
   * Operation definition in the document
   */
  operation: OperationDefinitionNode;
  /**
   * The fragment definitions in the document
   */
  fragments: Record<string, FragmentDefinitionNode>;
  /**
   * The coerced variable values
   */
  variableValues: Record<string, any>;
  /**
   * The final data
   */
  data: Record<string, EntityRepresentation>;
  /**
   * The final set of errors
   */
  errors: GraphQLError[];


  /**
   * The factory function that returns an executor for a subgraph
   */
  getSubgraphExecutor: (subgraphName: string) => Executor;

  /**
   * The function that parses a document node
   * Allows user to modify this in order to have a server-side memoization
   */
  parseDocumentNode: (document: string) => DocumentNode;
}

export interface EntityRepresentation {
    __typename: string;
    [key: string]: any;
}

export function isEntityRepresentation(obj: any): obj is EntityRepresentation {
  return obj?.__typename != null;
}