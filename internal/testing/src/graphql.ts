import { MeshFetch } from '@graphql-mesh/types';
import { fetch as whatwgFetch } from '@whatwg-node/fetch';
import { ExecutionResult } from 'graphql';

type Fetch = typeof whatwgFetch | MeshFetch;

// instances of servers that have a fetch method
type ContainsFetch = { fetch: Fetch };

export type ExecuteFetchArgs =
  | {
      // regular request
      headers?: Record<string, string>;
      query: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    }
  | {
      // persisted documents
      headers?: Record<string, string>;
      documentId: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    };

export function executeFetch(
  containsFetch: ContainsFetch,
  args: ExecuteFetchArgs,
): Promise<ExecutionResult>;
export function executeFetch(
  fetch: Fetch,
  args: ExecuteFetchArgs,
): Promise<ExecutionResult>;
export async function executeFetch(
  containsFetchOrFetchOrUrl: ContainsFetch | Fetch | string,
  { headers, ...execArgs }: ExecuteFetchArgs,
): Promise<ExecutionResult> {
  const url =
    typeof containsFetchOrFetchOrUrl === 'string'
      ? containsFetchOrFetchOrUrl
      : 'http://localhost/graphql'; // when providing fetch directly, the url is not important
  const fetch =
    typeof containsFetchOrFetchOrUrl === 'string'
      ? whatwgFetch
      : typeof containsFetchOrFetchOrUrl === 'function'
        ? containsFetchOrFetchOrUrl
        : containsFetchOrFetchOrUrl.fetch;
  const res = await fetch(url, initForExecuteFetchArgs(execArgs, headers));
  const resText = await res.text();
  try {
    // could be a graphql execution result with errors on a 4XX or 5XX status code
    return JSON.parse(resText);
  } catch {
    // not a GraphQL error, something weird happened
    throw new ResponseError({
      status: res.status,
      statusText: res.statusText,
      resText,
    });
  }
}

export function initForExecuteFetchArgs(
  args: ExecuteFetchArgs,
  headers?: Record<string, string>,
) {
  return {
    method: 'POST',
    headers: {
      accept: 'application/graphql-response+json, application/json',
      ...headers,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  };
}
