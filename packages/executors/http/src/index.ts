import { abortSignalAny } from '@graphql-hive/signal';
import {
  defaultPrintFn,
  SerializedExecutionRequest,
  serializeExecutionRequest,
  UpstreamErrorExtensions,
} from '@graphql-tools/executor-common';
import {
  createGraphQLError,
  DisposableAsyncExecutor,
  DisposableExecutor,
  DisposableSyncExecutor,
  ExecutionRequest,
  ExecutionResult,
  Executor,
  getOperationASTFromRequest,
  MaybeAsyncIterable,
} from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { fetch as defaultFetch } from '@whatwg-node/fetch';
import {
  handleMaybePromise,
  isPromise,
  MaybePromise,
} from '@whatwg-node/promise-helpers';
import { DocumentNode, GraphQLResolveInfo } from 'graphql';
import { createFormDataFromVariables } from './createFormDataFromVariables.js';
import { handleEventStreamResponse } from './handleEventStreamResponse.js';
import { handleMultipartMixedResponse } from './handleMultipartMixedResponse.js';
import { isLiveQueryOperationDefinitionNode } from './isLiveQueryOperationDefinitionNode.js';
import { prepareGETUrl } from './prepareGETUrl.js';
import {
  createGraphQLErrorForAbort,
  createResultForAbort,
  hashSHA256,
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
   * The endpoint to use when querying the upstream API. Can also be a factory function that returns the
   * endpoint based on the `ExecutionRequest` allowing for dynamic endpoints, such as using environment
   * variables or other runtime values.
   * @default '/graphql'
   */
  endpoint?: string | ((executorRequest?: ExecutionRequest) => string);
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
  timeout?: number | ((request: ExecutionRequest) => number | undefined);
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
  /**
   * On dispose abort error
   */
  getDisposeReason?(): Error | undefined;
  /**
   * Whether to deduplicate inflight requests with the same parameters.
   * This can be useful to avoid making multiple identical requests to the upstream service when
   * multiple parts of the gateway are requesting the same data at the same time.
   * @default true
   */
  deduplicateInflightRequests?: boolean;
}

export type HeadersConfig = Record<string, string>;

export interface InflightRequestOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | FormData;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
}

type InflightRequestId = string;

const inflightRequests = new Map<InflightRequestId, Promise<ExecutionResult>>();

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
  let disposeCtrl: AbortController | undefined;
  const baseExecutor = (
    request: ExecutionRequest<any, any, any, HTTPExecutorOptions>,
    excludeQuery?: boolean,
  ) => {
    // Cloudflare Workers doesn't like the shared AbortController
    if (!request.context?.request?.cf) {
      disposeCtrl ||= new AbortController();
    }
    if (disposeCtrl?.signal.aborted) {
      return createResultForAbort(disposeCtrl.signal.reason);
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
    let subscriptionCtrl: AbortController | undefined;
    if (
      operationType === 'subscription' ||
      isLiveQueryOperationDefinitionNode(operationAst)
    ) {
      method ||= 'GET';
      accept = 'text/event-stream';
      subscriptionCtrl = new AbortController();
    } else {
      method ||= 'POST';
    }

    let endpoint: string | undefined;

    if (request.extensions?.endpoint) {
      if (typeof request.extensions.endpoint === 'string') {
        endpoint = request.extensions.endpoint;
      }
      if (typeof request.extensions.endpoint === 'function') {
        endpoint = request.extensions.endpoint(request);
      }
    }
    if (!endpoint) {
      if (typeof options?.endpoint === 'string') {
        endpoint = options.endpoint;
      }
      if (typeof options?.endpoint === 'function') {
        endpoint = options.endpoint(request);
      }
    }
    if (!endpoint) {
      endpoint = '/graphql';
    }

    let isCustomHeader = false;

    const headers: Record<string, any> = { accept };

    if (options?.headers) {
      isCustomHeader = true;
      Object.assign(
        headers,
        typeof options?.headers === 'function'
          ? options.headers(request)
          : options?.headers,
      );
    }

    if (request.extensions?.headers) {
      isCustomHeader = true;
      const { headers: headersFromExtensions, ...restExtensions } =
        request.extensions;
      Object.assign(headers, headersFromExtensions);
      request.extensions = restExtensions;
    }

    const signals = [];
    if (disposeCtrl?.signal) {
      signals.push(disposeCtrl.signal);
    }
    const signalFromRequest = request.signal || request.info?.signal;
    if (signalFromRequest) {
      if (signalFromRequest.aborted) {
        return createResultForAbort(signalFromRequest.reason);
      }
      signals.push(signalFromRequest);

    if (options?.timeout) {
      const timeout = typeof options.timeout === 'number' ? options.timeout : options.timeout(request);
      if (timeout) {
        signals.push(AbortSignal.timeout(timeout));
      }
    }

    if (subscriptionCtrl) {
      signals.push(subscriptionCtrl.signal);
    }

    const signal = signals.length ? abortSignalAny(signals) : undefined;

    const upstreamErrorExtensions: UpstreamErrorExtensions = {
      request: {
        method,
      },
    };

    const query = printFn(request.document);

    let serializeFn =
      function serialize(): MaybePromise<SerializedExecutionRequest> {
        return serializeExecutionRequest({
          executionRequest: request,
          excludeQuery,
          printFn,
        });
      };

    if (options?.apq) {
      serializeFn =
        function serializeWithAPQ(): MaybePromise<SerializedExecutionRequest> {
          return handleMaybePromise(
            () => hashSHA256(query),
            (sha256Hash) => {
              const extensions: Record<string, any> = request.extensions || {};
              extensions['persistedQuery'] = {
                version: 1,
                sha256Hash,
              };
              return serializeExecutionRequest({
                executionRequest: {
                  ...request,
                  extensions,
                },
                excludeQuery,
                printFn,
              });
            },
          );
        };
    }

    function handleError(e: any) {
      upstreamErrorExtensions.code = 'SUBREQUEST_HTTP_ERROR';
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
    }

    function handleInflightRequest(
      inflightRequestOptions: InflightRequestOptions,
      context?: any,
      info?: GraphQLResolveInfo,
    ): MaybePromise<ExecutionResult> {
      if (options?.deduplicateInflightRequests === false) {
        return runInflightRequest();
      }
      function runInflightRequest() {
        return handleMaybePromise(
          () =>
            fetchFn(
              inflightRequestOptions.url,
              {
                method: inflightRequestOptions.method,
                headers: inflightRequestOptions.headers,
                body: inflightRequestOptions.body,
                credentials: inflightRequestOptions.credentials,
                signal: inflightRequestOptions.signal,
              },
              context,
              info,
            ) as Promise<Response> | Response,
          (fetchResult: Response) =>
            handleMaybePromise<
              MaybeAsyncIterable<ExecutionResult> | string,
              ExecutionResult
            >(
              () => {
                upstreamErrorExtensions.response ||= {};
                upstreamErrorExtensions.response.status = fetchResult.status;
                upstreamErrorExtensions.response.statusText =
                  fetchResult.statusText;
                Object.defineProperty(
                  upstreamErrorExtensions.response,
                  'headers',
                  {
                    get() {
                      return Object.fromEntries(fetchResult.headers.entries());
                    },
                  },
                );

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
                  return handleEventStreamResponse(
                    fetchResult,
                    subscriptionCtrl,
                    signal,
                  );
                } else if (contentType?.includes('multipart/mixed')) {
                  return handleMultipartMixedResponse(fetchResult);
                }

                return fetchResult.text();
              },
              (result) => {
                if (typeof result === 'string') {
                  upstreamErrorExtensions.response ||= {};
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
                        const message = `Unexpected empty "data" and "errors" fields in result: ${result}`;
                        upstreamErrorExtensions.code =
                          'RESPONSE_VALIDATION_FAILED';
                        return {
                          errors: [
                            createGraphQLError(message, {
                              originalError: new Error(message),
                              extensions: upstreamErrorExtensions,
                            }),
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
                            }) => createGraphQLError(message, options),
                          ),
                        };
                      }
                      return parsedResult;
                    } catch (e: any) {
                      upstreamErrorExtensions.code =
                        'RESPONSE_VALIDATION_FAILED';
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
                  } else {
                    const message = 'No response returned';
                    upstreamErrorExtensions.code = 'RESPONSE_VALIDATION_FAILED';
                    return {
                      errors: [
                        createGraphQLError(message, {
                          extensions: upstreamErrorExtensions,
                          originalError: new Error(message),
                        }),
                      ],
                    };
                  }
                } else {
                  return result;
                }
              },
              handleError,
            ),
          handleError,
        );
      }
      if (typeof inflightRequestOptions.body === 'object') {
        return runInflightRequest();
      }
      let inflightRequestId = `${inflightRequestOptions.url}|${inflightRequestOptions.method}`;
      if (inflightRequestOptions.body) {
        inflightRequestId += `|${inflightRequestOptions.body}`;
      }
      if (isCustomHeader) {
        inflightRequestId += `|${JSON.stringify(inflightRequestOptions.headers)}`;
      }
      let inflightRequest: MaybePromise<ExecutionResult> | undefined =
        inflightRequests.get(inflightRequestId);
      if (!inflightRequest) {
        inflightRequest = runInflightRequest();
        if (isPromise(inflightRequest)) {
          inflightRequests.set(inflightRequestId, inflightRequest);
          inflightRequest.finally(() => {
            inflightRequests.delete(inflightRequestId);
          });
        }
      }
      return inflightRequest;
    }

    return handleMaybePromise(
      () => serializeFn(),
      (body: SerializedExecutionRequest) => {
        switch (method) {
          case 'GET': {
            const finalUrl = prepareGETUrl({
              baseUrl: endpoint,
              body,
            });
            const inflightRequestOptions: InflightRequestOptions = {
              url: finalUrl,
              method: 'GET',
              headers,
              signal,
              credentials: options?.credentials,
            };
            upstreamErrorExtensions.request.url = finalUrl;
            return handleInflightRequest(
              inflightRequestOptions,
              request.context,
              request.info,
            );
          }
          case 'POST': {
            upstreamErrorExtensions.request.body = body;
            return handleMaybePromise(
              () =>
                createFormDataFromVariables(body, {
                  File: options?.File,
                  FormData: options?.FormData,
                }),
              (body) => {
                if (typeof body === 'string' && !headers['content-type']) {
                  upstreamErrorExtensions.request.body = body;
                  headers['content-type'] = 'application/json';
                }
                const inflightRequestOptions: InflightRequestOptions = {
                  url: endpoint!,
                  method: 'POST',
                  body,
                  headers,
                  credentials: options?.credentials,
                  signal,
                };
                return handleInflightRequest(
                  inflightRequestOptions,
                  request.context,
                  request.info,
                );
              },
              handleError,
            );
          }
        }
      },
      handleError,
    );
  };

  let executor: Executor = baseExecutor;

  if (options?.apq != null) {
    executor = function apqExecutor(request: ExecutionRequest) {
      return handleMaybePromise(
        () => baseExecutor(request, true),
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
        | Promise<ExecutionResult<any>>
        | ExecutionResult<any> {
        if (disposeCtrl?.signal.aborted) {
          return createResultForAbort(disposeCtrl.signal.reason);
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
        return handleMaybePromise(
          () => prevExecutor(request),
          (res) => {
            result = res;
            if (result?.errors?.length) {
              return retryAttempt();
            }
            return result;
          },
        );
      }
      return retryAttempt();
    };
  }

  Object.defineProperties(executor, {
    [DisposableSymbols.dispose]: {
      get() {
        return function dispose() {
          disposeCtrl?.abort(options?.getDisposeReason?.());
          disposeCtrl = undefined;
        };
      },
    },
    [DisposableSymbols.asyncDispose]: {
      get() {
        return function asyncDispose() {
          disposeCtrl?.abort(options?.getDisposeReason?.());
          disposeCtrl = undefined;
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
    signal?: AbortSignal;
    endpoint?: string;
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
  } else if (e.name === 'AbortError') {
    return createGraphQLErrorForAbort(
      signal?.reason || e,
      upstreamErrorExtensions,
    );
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
