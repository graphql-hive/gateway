import { getDocumentString } from '@envelop/core';
import { ExecutionRequest, memoize1 } from '@graphql-tools/utils';
import { DocumentNode, print, stripIgnoredCharacters } from 'graphql';

export const defaultPrintFn = memoize1(function defaultPrintFn(
  document: DocumentNode,
) {
  return stripIgnoredCharacters(getDocumentString(document, print));
});

interface ExecutionRequestToGraphQLParams {
  executionRequest: ExecutionRequest;
  excludeQuery?: boolean;
  printFn?: typeof defaultPrintFn;
}

export interface GraphQLParams {
  query?: string | undefined;
  variables?: Record<string, any>;
  operationName?: string;
  extensions?: Record<string, any>;
}

export function executionRequestToGraphQLParams(
  opts: Omit<ExecutionRequestToGraphQLParams, 'excludeQuery'> & {
    excludeQuery: true;
  },
): Omit<GraphQLParams, 'query'>;
export function executionRequestToGraphQLParams(
  opts: Omit<ExecutionRequestToGraphQLParams, 'excludeQuery'> & {
    excludeQuery?: false;
  },
): Omit<GraphQLParams, 'query'> & { query: string };
export function executionRequestToGraphQLParams(
  opts: ExecutionRequestToGraphQLParams,
): GraphQLParams;
export function executionRequestToGraphQLParams({
  executionRequest,
  excludeQuery,
  printFn = defaultPrintFn,
}: ExecutionRequestToGraphQLParams): GraphQLParams {
  return {
    query: excludeQuery ? undefined : printFn(executionRequest.document),
    variables:
      (executionRequest.variables &&
        Object.keys(executionRequest.variables).length) > 0
        ? executionRequest.variables
        : undefined,
    operationName: executionRequest.operationName
      ? executionRequest.operationName
      : undefined,
    extensions:
      executionRequest.extensions &&
      Object.keys(executionRequest.extensions).length > 0
        ? executionRequest.extensions
        : undefined,
  };
}
