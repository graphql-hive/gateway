import type {
  ExecutionRequest,
  ExecutionResult,
  MaybeAsyncIterable,
  MaybePromise,
} from '@graphql-tools/utils';
import type {
  FragmentDefinitionNode,
  GraphQLError,
  GraphQLSchema,
  OperationDefinitionNode,
} from 'graphql';

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
  variableValues?: Record<string, any>;
  /**
   * The final data
   */
  data: Record<string, EntityRepresentation>;
  /**
   * The final set of errors
   */
  errors: GraphQLError[];

  /**
   * The context object
   */
  context?: any;

  /**
   * The factory function that returns an executor for a subgraph
   */
  onSubgraphExecute(
    subgraphName: string,
    executionRequest: ExecutionRequest,
  ): MaybePromise<MaybeAsyncIterable<ExecutionResult>>;
}

export interface EntityRepresentation {
  __typename: string;
  [key: string]: any;
}

export function isEntityRepresentation(obj: any): obj is EntityRepresentation {
  return obj?.__typename != null;
}
