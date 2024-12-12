import {
  createGraphQLError,
  DisposableAsyncExecutor,
  DisposableExecutor,
  DisposableSyncExecutor,
  ExecutionRequest,
  ExecutionResult,
  Executor,
  getOperationASTFromRequest,
  mapMaybePromise,
  MaybePromise,
} from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { fetch as defaultFetch } from '@whatwg-node/fetch';
import { DocumentNode, GraphQLResolveInfo } from 'graphql';
import { ValueOrPromise } from 'value-or-promise';
import { createFormDataFromVariables } from './createFormDataFromVariables.js';
import { defaultPrintFn } from './defaultPrintFn.js';
import { handleEventStreamResponse } from './handleEventStreamResponse.js';
import { handleMultipartMixedResponse } from './handleMultipartMixedResponse.js';
import { isLiveQueryOperationDefinitionNode } from './isLiveQueryOperationDefinitionNode.js';
import { prepareGETUrl } from './prepareGETUrl.js';
import {
  createAbortErrorReason,
  createGraphQLErrorForAbort,
  createResultForAbort,
  hashSHA256,
  SerializedRequest,
} from './utils.js';

export type SyncFetchFn = (
  url: string,
  init?: RequestInit,
  context?: any,
  info?: GraphQLResolveInfo,
) => SyncResponse;
export type SyncResponse = Omit<Response, 'json' | 'text'> & {
  json: () => any;
  text: () => string;
};

export type AsyncFetchFn = (
  url: string,
  options?: RequestInit,
  context?: any,
  info?: GraphQLResolveInfo,
) => Promise<Response> | Response;

export type RegularFetchFn = (url: string) => Promise<Response> | Response;

export type FetchFn = AsyncFetchFn | SyncFetchFn | RegularFetchFn;

export type AsyncImportFn = (moduleName: string) => PromiseLike<any>;
export type SyncImportFn = (moduleName: string) => any;

export interface HTTPExecutorOptions {
  /**
   * The endpoint to use when querying the upstream API
   * @default '/graphql'
   */
  endpoint?: string;
  /**
   * The WHATWG compatible fetch implementation to use
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
   * @default globalThis.fetch
   */
  fetch?: FetchFn;
  /**
   * Whether to use the GET HTTP method for queries when querying the original schema
   * @default false
   */
  useGETForQueries?: boolean;
  /**
   * Additional headers to include when querying the original schema
   */
  headers?:
    | HeadersConfig
    | ((executorRequest?: ExecutionRequest) => HeadersConfig);
  /**
   * HTTP method to use when querying the original schema.x
   * @default 'POST'
   */
  method?: 'GET' | 'POST';
  /**
   * Timeout in milliseconds
   */
  timeout?: number;
  /**
   * Request Credentials
   * @default 'same-origin'
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials
   */
  credentials?: RequestCredentials;
  /**
   * Retry attempts
   */
  retry?: number;
  /**
   * WHATWG compatible `File` implementation
   * @see https://developer.mozilla.org/en-US/docs/Web/API/File
   */
  File?: typeof File;
  /**
   * WHATWG compatible `FormData` implementation
   * @see https://developer.mozilla.org/en-US/docs/Web/API/FormData
   */
  FormData?: typeof FormData;
  /**
   * Print function for `DocumentNode`
   * Useful when you want to memoize the print function or use a different implementation to minify the query etc.
   */
  print?: (doc: DocumentNode) => string;
  /**
   * Enable Automatic Persisted Queries
   * @see https://www.apollographql.com/docs/apollo-server/performance/apq/
   */
  apq?: boolean;
  /**
   * Enable Explicit Resource Management
   * @see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management
   * @deprecated The executors are always disposable, and this option will be removed in the next major version, there is no need to have a flag for this.
   */
  disposable?: boolean;
}

export type HeadersConfig = Record<string, string>;

// To prevent event listener warnings
function createSignalWrapper(signal: AbortSignal): AbortSignal {
  const listeners = new Set<EventListener>();
  signal.onabort = (event) => {
    for (const listener of listeners) {
      listener(event);
    }
  };
  return Object.assign(signal, {
    addEventListener(_type: 'abort', listener: EventListener) {
      listeners.add(listener);
    },
    removeEventListener(_type: 'abort', listener: EventListener) {
      listeners.delete(listener);
    },
  });
}

export function buildHTTPExecutor(
  options?: Omit<HTTPExecutorOptions, 'fetch'> & {
    fetch: SyncFetchFn;
  },
): DisposableSyncExecutor<any, HTTPExecutorOptions>;

export function buildHTTPExecutor(
  options?: Omit<HTTPExecutorOptions, 'fetch'> & {
    fetch: AsyncFetchFn;
  },
): DisposableAsyncExecutor<any, HTTPExecutorOptions>;

export function buildHTTPExecutor(
  options?: Omit<HTTPExecutorOptions, 'fetch'> & {
    fetch: RegularFetchFn;
  },
): DisposableAsyncExecutor<any, HTTPExecutorOptions>;

export function buildHTTPExecutor(
  options?: Omit<HTTPExecutorOptions, 'fetch'>,
): DisposableAsyncExecutor<any, HTTPExecutorOptions>;

export function buildHTTPExecutor(
  options?: HTTPExecutorOptions,
): DisposableExecutor<any, HTTPExecutorOptions> {
  const printFn = options?.print ?? defaultPrintFn;
  const disposeCtrl = new AbortController();
  const sharedSignal = createSignalWrapper(disposeCtrl.signal);
  const baseExecutor = (
    request: ExecutionRequest<any, any, any, HTTPExecutorOptions>,
    excludeQuery?: boolean,
  ) => {
    if (sharedSignal.aborted) {
      return createResultForAbort(sharedSignal.reason);
    }
    const fetchFn = request.extensions?.fetch ?? options?.fetch ?? defaultFetch;
    let method = request.extensions?.method || options?.method;

    const operationAst = getOperationASTFromRequest(request);
    const operationType = operationAst.operation;

    if (
      (options?.useGETForQueries || request.extensions?.useGETForQueries) &&
      operationType === 'query'
    ) {
      method = 'GET';
    }

    let accept =
      'application/graphql-response+json, application/json, multipart/mixed';
    if (
      operationType === 'subscription' ||
      isLiveQueryOperationDefinitionNode(operationAst)
    ) {
      method ||= 'GET';
      accept = 'text/event-stream';
    } else {
      method ||= 'POST';
    }

    const endpoint =
      request.extensions?.endpoint || options?.endpoint || '/graphql';
    const headers: Record<string, any> = { accept };

    if (options?.headers) {
      Object.assign(
        headers,
        typeof options?.headers === 'function'
          ? options.headers(request)
          : options?.headers,
      );
    }

    if (request.extensions?.headers) {
      const { headers: headersFromExtensions, ...restExtensions } =
        request.extensions;
      Object.assign(headers, headersFromExtensions);
      request.extensions = restExtensions;
    }

    let signal = sharedSignal;
    if (options?.timeout) {
      signal = AbortSignal.any([
        sharedSignal,
        AbortSignal.timeout(options.timeout),
      ]);
    }

    const upstreamErrorExtensions: UpstreamErrorExtensions = {
      request: {
        method,
      },
      response: {},
    };

    const query = printFn(request.document);

    let serializeFn = function serialize(): MaybePromise<SerializedRequest> {
      return {
        query: excludeQuery ? undefined : printFn(request.document),
        variables:
          (request.variables && Object.keys(request.variables).length) > 0
            ? request.variables
            : undefined,
        operationName: request.operationName
          ? request.operationName
          : undefined,
        extensions:
          (request.extensions && Object.keys(request.extensions).length > 0)
            ? request.extensions
            : undefined,
      };
    };

    if (options?.apq) {
      serializeFn =
        function serializeWithAPQ(): MaybePromise<SerializedRequest> {
          return mapMaybePromise(hashSHA256(query), (sha256Hash) => {
            const extensions: Record<string, any> = request.extensions || {};
            extensions['persistedQuery'] = {
              version: 1,
              sha256Hash,
            };
            return {
              query: excludeQuery ? undefined : query,
              variables:
                (request.variables && Object.keys(request.variables).length) > 0
                  ? request.variables
                  : undefined,
              operationName: request.operationName
                ? request.operationName
                : undefined,
              extensions,
            };
          });
        };
    }

    return mapMaybePromise(serializeFn(), (body: SerializedRequest) =>
      new ValueOrPromise(() => {
        switch (method) {
          case 'GET': {
            const finalUrl = prepareGETUrl({
              baseUrl: endpoint,
              body,
            });
            const fetchOptions: RequestInit = {
              method: 'GET',
              headers,
              signal,
            };
            if (options?.credentials != null) {
              fetchOptions.credentials = options.credentials;
            }
            upstreamErrorExtensions.request.url = finalUrl;
            return fetchFn(
              finalUrl,
              fetchOptions,
              request.context,
              request.info,
            );
          }
          case 'POST': {
            upstreamErrorExtensions.request.body = body;
            return mapMaybePromise(
              createFormDataFromVariables(body, {
                File: options?.File,
                FormData: options?.FormData,
              }),
              (body) => {
                if (typeof body === 'string' && !headers['content-type']) {
                  upstreamErrorExtensions.request.body = body;
                  headers['content-type'] = 'application/json';
                }
                const fetchOptions: RequestInit = {
                  method: 'POST',
                  body,
                  headers,
                  signal,
                };
                if (options?.credentials != null) {
                  fetchOptions.credentials = options.credentials;
                }
                return fetchFn(
                  endpoint,
                  fetchOptions,
                  request.context,
                  request.info,
                ) as any;
              },
            );
          }
        }
      })
        .then((fetchResult: Response): any => {
          upstreamErrorExtensions.response.status = fetchResult.status;
          upstreamErrorExtensions.response.statusText = fetchResult.statusText;
          Object.defineProperty(upstreamErrorExtensions.response, 'headers', {
            get() {
              return Object.fromEntries(fetchResult.headers.entries());
            },
          });

          // Retry should respect HTTP Errors
          if (
            options?.retry != null &&
            !fetchResult.status.toString().startsWith('2')
          ) {
            throw new Error(
              fetchResult.statusText ||
                `Upstream HTTP Error: ${fetchResult.status}`,
            );
          }

          const contentType = fetchResult.headers.get('content-type');
          if (contentType?.includes('text/event-stream')) {
            return handleEventStreamResponse(signal, fetchResult);
          } else if (contentType?.includes('multipart/mixed')) {
            return handleMultipartMixedResponse(fetchResult);
          }

          return fetchResult.text();
        })
        .then((result) => {
          if (typeof result === 'string') {
            upstreamErrorExtensions.response.body = result;
            if (result) {
              try {
                const parsedResult = JSON.parse(result);
                upstreamErrorExtensions.response.body = parsedResult;
                if (
                  parsedResult.data == null &&
                  (parsedResult.errors == null ||
                    parsedResult.errors.length === 0)
                ) {
                  return {
                    errors: [
                      createGraphQLError(
                        'Unexpected empty "data" and "errors" fields in result: ' +
                          result,
                        {
                          extensions: upstreamErrorExtensions,
                        },
                      ),
                    ],
                  };
                }
                if (Array.isArray(parsedResult.errors)) {
                  return {
                    ...parsedResult,
                    errors: parsedResult.errors.map(
                      ({
                        message,
                        ...options
                      }: {
                        message: string;
                        extensions: Record<string, unknown>;
                      }) =>
                        createGraphQLError(message, {
                          ...options,
                          extensions: {
                            code: 'DOWNSTREAM_SERVICE_ERROR',
                            ...(options.extensions || {}),
                          },
                        }),
                    ),
                  };
                }
                return parsedResult;
              } catch (e: any) {
                return {
                  errors: [
                    createGraphQLError(
                      `Unexpected response: ${JSON.stringify(result)}`,
                      {
                        extensions: upstreamErrorExtensions,
                        originalError: e,
                      },
                    ),
                  ],
                };
              }
            }
          } else {
            return result;
          }
        })
        .catch((e: any) => {
          if (e.name === 'AggregateError') {
            return {
              errors: e.errors.map((e: any) =>
                coerceFetchError(e, {
                  signal,
                  endpoint,
                  upstreamErrorExtensions,
                }),
              ),
            };
          }
          return {
            errors: [
              coerceFetchError(e, {
                signal,
                endpoint,
                upstreamErrorExtensions,
              }),
            ],
          };
        })
        .resolve(),
    );
  };

  let executor: Executor = baseExecutor;

  if (options?.apq != null) {
    executor = function apqExecutor(request: ExecutionRequest) {
      return mapMaybePromise(
        baseExecutor(request, true),
        (res: ExecutionResult) => {
          if (
            res.errors?.some(
              (error) =>
                error.extensions['code'] === 'PERSISTED_QUERY_NOT_FOUND' ||
                error.message === 'PersistedQueryNotFound',
            )
          ) {
            return baseExecutor(request, false);
          }
          return res;
        },
      );
    };
  }

  if (options?.retry != null) {
    const prevExecutor = executor as typeof baseExecutor;
    executor = function retryExecutor(request: ExecutionRequest) {
      let result: ExecutionResult<any> | undefined;
      let attempt = 0;
      function retryAttempt():
        | PromiseLike<ExecutionResult<any>>
        | ExecutionResult<any> {
        if (sharedSignal.aborted) {
          return createResultForAbort(sharedSignal.reason);
        }
        attempt++;
        if (attempt > options!.retry!) {
          if (result != null) {
            return result;
          }
          return {
            errors: [createGraphQLError('No response returned from fetch')],
          };
        }
        return mapMaybePromise(prevExecutor(request), (res) => {
          result = res;
          if (result?.errors?.length) {
            return retryAttempt();
          }
          return result;
        });
      }
      return retryAttempt();
    };
  }

  Object.defineProperties(executor, {
    [DisposableSymbols.dispose]: {
      get() {
        return function dispose() {
          return disposeCtrl.abort(createAbortErrorReason());
        };
      },
    },
    [DisposableSymbols.asyncDispose]: {
      get() {
        return function asyncDispose() {
          return disposeCtrl.abort(createAbortErrorReason());
        };
      },
    },
  });

  return executor as DisposableExecutor<any, HTTPExecutorOptions>;
}

function coerceFetchError(
  e: any,
  {
    signal,
    endpoint,
    upstreamErrorExtensions,
  }: {
    signal: AbortSignal;
    endpoint: string;
    upstreamErrorExtensions: UpstreamErrorExtensions;
  },
) {
  if (typeof e === 'string') {
    return createGraphQLError(e, {
      extensions: upstreamErrorExtensions,
    });
  } else if (e.name === 'GraphQLError') {
    return e;
  } else if (e.name === 'TypeError' && e.message === 'fetch failed') {
    return createGraphQLError(`fetch failed to ${endpoint}`, {
      extensions: upstreamErrorExtensions,
      originalError: e,
    });
  } else if (e.name === 'AbortError' && signal.reason) {
    return createGraphQLErrorForAbort(signal.reason, {
      extensions: upstreamErrorExtensions,
    });
  } else if (e.message) {
    return createGraphQLError(e.message, {
      extensions: upstreamErrorExtensions,
      originalError: e,
    });
  } else {
    return createGraphQLError('Unknown error', {
      extensions: upstreamErrorExtensions,
      originalError: e,
    });
  }
}

export { isLiveQueryOperationDefinitionNode };

interface UpstreamErrorExtensions {
  request: {
    url?: string;
    method: string;
    body?: unknown;
  };
  response: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
}
