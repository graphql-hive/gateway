import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import type { GatewayContext, GatewayPlugin } from '../types';

interface FromClientToSubgraphsPayload<TContext extends Record<string, any>> {
  context: GatewayContext & Partial<TContext>;
  request: Request;
  subgraphName: string;
}

interface FromSubgraphsToClientPayload<TContext extends Record<string, any>> {
  context: GatewayContext & Partial<TContext>;
  response: Response;
  subgraphName: string;
}

export interface PropagateHeadersOpts<TContext extends Record<string, any>> {
  fromClientToSubgraphs?: (
    payload: FromClientToSubgraphsPayload<TContext>,
  ) =>
    | Record<string, string | null | undefined>
    | void
    | Promise<Record<string, string | null | undefined> | void>;
  fromSubgraphsToClient?: (
    payload: FromSubgraphsToClientPayload<TContext>,
  ) =>
    | Record<string, string | string[] | null | undefined>
    | void
    | Promise<Record<string, string | string[] | null | undefined> | void>;
}

export function usePropagateHeaders<TContext extends Record<string, any>>(
  opts: PropagateHeadersOpts<TContext>,
): GatewayPlugin<TContext> {
  const resHeadersByRequest = new WeakMap<Request, Record<string, string[]>>();
  return {
    onSubgraphExecute({ executionRequest, subgraphName }) {
      if (opts.fromClientToSubgraphs) {
        const request = executionRequest?.context?.request;
        if (request) {
          return handleMaybePromise(
            () =>
              opts.fromClientToSubgraphs?.({
                context: executionRequest.context!,
                request,
                subgraphName,
              }),
            (propagatingHeaders) => {
              // If there is an execution request, we pass it to the execution request
              // So that the executor can decide how to use it
              // This is needed for the cases like inflight request deduplication
              const existingHeaders = executionRequest.extensions?.['headers'];
              let headers = existingHeaders;
              for (const key in propagatingHeaders) {
                const value = propagatingHeaders[key];
                if (value != null && headers?.[key] == null) {
                  headers ||= {};
                  // we want to propagate only headers that are not nullish
                  // we also want to avoid overwriting existing headers
                  headers[key] = value;
                }
              }
              if (headers != null && Object.keys(headers).length > 0) {
                const extensions = (executionRequest.extensions ||= {});
                extensions['headers'] = headers;
              }
            },
          );
        }
      }
    },
    onFetch({ executionRequest }) {
      if (opts.fromSubgraphsToClient) {
        return function onFetchDone({ response }) {
          const request = executionRequest?.context?.request;
          const subgraphName = executionRequest?.subgraphName;
          if (opts.fromSubgraphsToClient && subgraphName && request) {
            return handleMaybePromise(
              () =>
                opts.fromSubgraphsToClient?.({
                  context: executionRequest.context!,
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
          }
        };
      }
      return;
    },
    onResponse({ response, request }) {
      const headers = resHeadersByRequest.get(request);
      if (headers) {
        for (const key in headers) {
          const value = headers[key];
          if (value) {
            for (const v of value) {
              if (key === 'set-cookie') {
                response.headers.append(key, v); // only set-cookie allows duplicated headers
              } else {
                response.headers.set(key, v);
              }
            }
          }
        }
      }
    },
  };
}
