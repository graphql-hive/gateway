import { subgraphNameByExecutionRequest } from '@graphql-mesh/fusion-runtime';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import type { GatewayPlugin, OnFetchHookDone } from '../types';

interface FromClientToSubgraphsPayload {
  request: Request;
  subgraphName: string;
}

interface FromSubgraphsToClientPayload {
  response: Response;
  subgraphName: string;
}

export interface PropagateHeadersOpts {
  fromClientToSubgraphs?: (
    payload: FromClientToSubgraphsPayload,
  ) =>
    | Record<string, string | null | undefined>
    | void
    | Promise<Record<string, string | null | undefined> | void>;
  fromSubgraphsToClient?: (
    payload: FromSubgraphsToClientPayload,
  ) =>
    | Record<string, string | string[] | null | undefined>
    | void
    | Promise<Record<string, string | string[] | null | undefined> | void>;
}

export function usePropagateHeaders<TContext extends Record<string, any>>(
  opts: PropagateHeadersOpts,
): GatewayPlugin<TContext> {
  const resHeadersByRequest = new WeakMap<Request, Record<string, string[]>>();
  return {
    onFetch({ executionRequest, context, options, setOptions }) {
      const request =
        'request' in context
          ? context?.request || executionRequest?.context?.request
          : undefined;
      if (request) {
        const subgraphName = (executionRequest &&
          subgraphNameByExecutionRequest.get(executionRequest))!;
        return handleMaybePromise(
          () =>
            handleMaybePromise(
              () =>
                opts.fromClientToSubgraphs?.({
                  request,
                  subgraphName,
                }),
              (propagatingHeaders) => {
                const headers = options.headers || {};
                for (const key in propagatingHeaders) {
                  const value = propagatingHeaders[key];
                  if (value != null && headers[key] == null) {
                    // we want to propagate only headers that are not nullish
                    // we also want to avoid overwriting existing headers
                    headers[key] = value;
                  }
                }
                setOptions({
                  ...options,
                  headers,
                });
              },
            ),
          (): OnFetchHookDone | void => {
            if (opts.fromSubgraphsToClient) {
              return function onFetchDone({ response }) {
                return handleMaybePromise(
                  () =>
                    opts.fromSubgraphsToClient?.({
                      response,
                      subgraphName,
                    }),
                  (headers) => {
                    if (headers && request) {
                      let existingHeaders = resHeadersByRequest.get(request);
                      if (!existingHeaders) {
                        existingHeaders = {};
                        resHeadersByRequest.set(request, existingHeaders);
                      }

                      // Merge headers across multiple subgraph calls
                      for (const key in headers) {
                        const value = headers[key];
                        if (value != null) {
                          const headerAsArray = Array.isArray(value)
                            ? value
                            : [value];
                          if (existingHeaders[key]) {
                            existingHeaders[key].push(...headerAsArray);
                          } else {
                            existingHeaders[key] = headerAsArray;
                          }
                        }
                      }
                    }
                  },
                );
              };
            }
          },
        );
      }
    },
    onResponse({ response, request }) {
      const headers = resHeadersByRequest.get(request);
      if (headers) {
        for (const key in headers) {
          const value = headers[key];
          if (value) {
            for (const v of value) {
              response.headers.append(key, v);
            }
          }
        }
      }
    },
  };
}
