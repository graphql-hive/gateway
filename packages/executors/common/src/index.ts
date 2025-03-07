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

export interface SerializedExecutionRequest {
  query?: string | undefined;
  variables?: Record<string, any>;
  operationName?: string;
  extensions?: Record<string, any>;
}

export function serializeExecutionRequest(
  opts: Omit<ExecutionRequestToGraphQLParams, 'excludeQuery'> & {
    excludeQuery: true;
  },
): Omit<SerializedExecutionRequest, 'query'>;
export function serializeExecutionRequest(
  opts: Omit<ExecutionRequestToGraphQLParams, 'excludeQuery'> & {
    excludeQuery?: false;
  },
): Omit<SerializedExecutionRequest, 'query'> & { query: string };
export function serializeExecutionRequest(
  opts: ExecutionRequestToGraphQLParams,
): SerializedExecutionRequest;
export function serializeExecutionRequest({
  executionRequest,
  excludeQuery,
  printFn = defaultPrintFn,
}: ExecutionRequestToGraphQLParams): SerializedExecutionRequest {
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

export interface UpstreamErrorExtensions {
  serviceName?: string;
  request: {
    url?: string;
    method?: string;
    body?: unknown;
  };
  response?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
}
