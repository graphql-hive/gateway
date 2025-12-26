import {
  getMostSpecificState,
  withState,
  type GatewayState,
  type GraphQLState,
  type HttpState,
} from '@envelop/core';
import {
  GatewayConfigContext,
  getRetryInfo,
  isRetryExecutionRequest,
  Logger,
  type GatewayPlugin,
} from '@graphql-hive/gateway-runtime';
import { getHeadersObj } from '@graphql-mesh/utils';
import { ExecutionRequest, fakePromise } from '@graphql-tools/utils';
import { unfakePromise } from '@whatwg-node/promise-helpers';
import {
  context,
  hive,
  propagation,
  ROOT_CONTEXT,
  trace,
  type Context,
  type TextMapGetter,
  type Tracer,
} from './api';
import { SEMATTRS_HIVE_REQUEST_ID } from './attributes';
import { OtelContextStack } from './context';
import {
  createGraphqlContextBuildingSpan,
  createGraphQLExecuteSpan,
  createGraphQLParseSpan,
  createGraphQLSpan,
  createGraphQLValidateSpan,
  createHttpSpan,
  createSchemaLoadingSpan,
  createSubgraphExecuteSpan,
  createUpstreamHttpFetchSpan,
  OperationHashingFn,
  recordCacheError,
  recordCacheEvent,
  registerException,
  setDocumentAttributesOnOperationSpan,
  setExecutionResultAttributes,
  setGraphQLExecutionAttributes,
  setGraphQLExecutionResultAttributes,
  setGraphQLParseAttributes,
  setGraphQLValidateAttributes,
  setParamsAttributes,
  setResponseAttributes,
  setSchemaAttributes,
  setUpstreamFetchAttributes,
  setUpstreamFetchResponseAttributes,
} from './spans';
import { isContextManagerCompatibleWithAsync } from './utils';

const initializationTime =
  'performance' in globalThis ? performance.now() : undefined;

const ignoredRequests = new WeakSet<Request>();

type BooleanOrPredicate<TInput = never> =
  | boolean
  | ((input: TInput) => boolean);

export type OpenTelemetryGatewayPluginOptions = {
  /**
   * Whether to rely on OTEL context api for span correlation.
   *  - `true`: the plugin will rely on OTEL context manager for span parenting.
   *  - `false`: the plugin will rely on request context for span parenting,
   *    which implies that parenting with user defined may be broken.
   *
   * By default, it is enabled if the registered Context Manager is compatible with async calls,
   * or if it is possible to register an `AsyncLocalStorageContextManager`.
   *
   * Note: If `true`, an error is thrown if it fails to obtain an async calls compatible Context Manager.
   */
  useContextManager?: boolean;
  /**
   * Whether to inherit the context from the calling service (default: true).
   *
   * This process is done by extracting the context from the incoming request headers. If disabled, a new context and a trace-id will be created.
   *
   * See https://opentelemetry.io/docs/languages/js/propagation/
   */
  inheritContext?: boolean;
  /**
   * Whether to propagate the context to the outgoing requests (default: true).
   *
   * This process is done by injecting the context into the outgoing request headers. If disabled, the context will not be propagated.
   *
   * See https://opentelemetry.io/docs/languages/js/propagation/
   */
  propagateContext?: boolean;
  /**
   * The TraceProvider method to call on Gateway's disposal. By default, it tries to run `forceFlush` method on
   * the registered trace provider if it exists.
   * Set to `false` to disable this behavior.
   * @default 'forceFlush'
   */
  flushOnDispose?: string | false;
  /**
   * Function to be used to compute the hash of each operation (graphql.operation.hash attribute).
   * Note: pass `null` to disable operation hashing
   *
   * @default `hashOperation` from @graphql-hive/core
   */
  hashOperation?: OperationHashingFn | null;
  /**
   * Tracing configuration
   */
  traces?: boolean | TracesConfig;
};

type TracesConfig = {
  /**
   * Tracer instance to use for creating spans (default: a tracer with name 'gateway').
   */
  tracer?: Tracer;
  /**
   * Options to control which spans to create.
   * By default, all spans are enabled.
   *
   * You may specify a boolean value to enable/disable all spans, or a function to dynamically enable/disable spans based on the input.
   */
  spans?: SpansConfig;
  events?: {
    /**
     * Enable/Disable cache related span events (default: true).
     */
    cache?: BooleanOrPredicate<{ key: string; action: 'read' | 'write' }>;
  };
};

type SpansConfig = {
  /**
   * Enable/disable HTTP request spans (default: true).
   *
   * Disabling the HTTP span will also disable all other child spans.
   */
  http?: BooleanOrPredicate<{
    request: Request;
    ignoredRequests: WeakSet<Request>;
  }>;
  /**
   * Enable/disable GraphQL operation spans (default: true).
   *
   * Disabling the GraphQL operation spa will also disable all other child spans.
   */
  graphql?: BooleanOrPredicate<{ context: unknown }>; // FIXME: better type for graphql context
  /**
   * Enable/disable GraphQL context building phase (default: true).
   */
  graphqlContextBuilding?: BooleanOrPredicate<{ context: unknown }>; // FIXME: better type for graphql context
  /**
   * Enable/disable GraphQL parse spans (default: true).
   */
  graphqlParse?: BooleanOrPredicate<{ context: unknown }>; // FIXME: better type for graphql context
  /**
   * Enable/disable GraphQL validate spans (default: true).
   */
  graphqlValidate?: BooleanOrPredicate<{ context: unknown }>;
  /**
   * Enable/disable GraphQL execute spans (default: true).
   *
   * Disabling the GraphQL execute spans will also disable all other child spans.
   */
  graphqlExecute?: BooleanOrPredicate<{ context: unknown }>;
  /**
   * Enable/disable subgraph execute spans (default: true).
   *
   * Disabling the subgraph execute spans will also disable all other child spans.
   */
  subgraphExecute?: BooleanOrPredicate<{
    executionRequest: ExecutionRequest;
    subgraphName: string;
  }>;
  /**
   * Enable/disable upstream HTTP fetch calls spans (default: true).
   */
  upstreamFetch?: BooleanOrPredicate<{
    executionRequest: ExecutionRequest | undefined;
  }>;
  /**
   * Enable/disable schema loading spans (default: true if context manager available).
   *
   * Note: This span requires an Async compatible context manager
   */
  schema?: boolean;
  /**
   * Enable/disable initialization span (default: true).
   */
  initialization?: boolean;
};

export const otelCtxForRequestId = new Map<string, Context>();

const HeadersTextMapGetter: TextMapGetter<Headers> = {
  keys(carrier) {
    return [...carrier.keys()];
  },
  get(carrier, key) {
    return carrier.get(key) || undefined;
  },
};

export type ContextMatcher = {
  request?: Request;
  context?: any;
  executionRequest?: ExecutionRequest;
};

export type OpenTelemetryPluginUtils = {
  tracer: Tracer;
  /**
   * Returns the current active OTEL context.
   *
   * Note: Defaults to `otel.context.active()` if no plugin is registered.
   */
  getActiveContext: (payload: ContextMatcher) => Context;
  /**
   * Returns the http request root span context.
   * Returns `undefined` if the current request is not being traced.
   *
   * Note: Defaults to `otel.context.active()` if no plugin is registered.
   */
  getHttpContext: (request: Request) => Context | undefined;
  /**
   * Returns the current GraphQL operation root span context.
   * Returns `undefined` if the current GraphQL operation is not being traced.
   *
   * Note: Defaults to `otel.context.active()` if no plugin is registered.
   */
  getOperationContext: (context: any) => Context | undefined;
  /**
   * Returns the current subgraph Execution Request root span context.
   * Returns `undefined` if the current subgraph Execution Request is not being traced.
   *
   * Note: Defaults to `otel.context.active()` if no plugin is registered.
   */
  getExecutionRequestContext: (
    ExecutionRequest: ExecutionRequest,
  ) => Context | undefined;
  /*
   * Marks the request to be ignored. It will not be traced and no span will be created for it.
   *
   * Note: No-op if no plugin is registered.
   * Note: This rely on HTTP span filtering and can stop working if you define a custom one without
   *       respecting the `ignoredRequests` list payload attributes.
   */
  ignoreRequest: (request: Request) => void;
};

export type OpenTelemetryContextExtension = {
  openTelemetry: {
    tracer: Tracer;
    getActiveContext: (payload?: ContextMatcher) => Context;
    getHttpContext: (request?: Request) => Context | undefined;
    getOperationContext: (context?: any) => Context | undefined;
    getExecutionRequestContext: (
      ExecutionRequest: ExecutionRequest,
    ) => Context | undefined;
  };
};

type OtelState = {
  otel: OtelContextStack;
};

type State = Partial<
  HttpState<OtelState> & GraphQLState<OtelState> & GatewayState<OtelState>
>;

export type OpenTelemetryPlugin = GatewayPlugin<OpenTelemetryContextExtension> &
  OpenTelemetryPluginUtils;

export function useOpenTelemetry(
  options: OpenTelemetryGatewayPluginOptions &
    // We ask for a Partial context to still allow the usage as a Yoga plugin
    Partial<GatewayConfigContext>,
): OpenTelemetryPlugin {
  const inheritContext = options.inheritContext ?? true;
  const propagateContext = options.propagateContext ?? true;
  let useContextManager: boolean;

  let tracer: Tracer;
  let traces: TracesConfig | undefined;
  let initSpan: Context | null;

  // TODO: Make it const once Yoga has the Hive Logger
  let pluginLogger: Logger | undefined =
    options.log && options.log.child('[OpenTelemetry] ');

  pluginLogger?.info('Enabled');

  // Resolve tracing configuration. `undefined` means disabled
  function isParentEnabled(state: State): boolean {
    const parentState = getMostSpecificState(state);
    return !parentState || !!parentState.otel;
  }

  function getContext(state?: State): Context {
    const specificState = getMostSpecificState(state)?.otel;

    if (initSpan && !specificState) {
      return initSpan;
    }

    if (useContextManager) {
      return context.active();
    }

    return specificState?.current ?? ROOT_CONTEXT;
  }

  let preparation$ = init();
  preparation$.then(() => {
    preparation$ = fakePromise();
  });

  async function init() {
    if (
      options.useContextManager !== false &&
      !(await isContextManagerCompatibleWithAsync())
    ) {
      useContextManager = false;
      if (options.useContextManager === true) {
        throw new Error(
          '[OTEL] Context Manager usage is enabled, but the registered one is not compatible with async calls.' +
            ' Please use another context manager, such as `AsyncLocalStorageContextManager`.',
        );
      }
    } else {
      useContextManager = options.useContextManager ?? true;
    }

    pluginLogger?.info('Initializing');

    tracer = traces?.tracer ?? trace.getTracer('gateway');
    traces = resolveTracesConfig(options, useContextManager, pluginLogger);

    initSpan = trace.setSpan(
      context.active(),
      tracer.startSpan('gateway.initialization', {
        startTime: initializationTime,
      }),
    );
  }

  const plugin = withState<
    GatewayPlugin<OpenTelemetryContextExtension>,
    OtelState,
    OtelState & { skipExecuteSpan?: true; subgraphNames: string[] },
    OtelState
  >((getState) => {
    hive.setPluginUtils({
      get tracer() {
        return tracer;
      },
      getActiveContext: (matcher) => getContext(getState(matcher)),
      getHttpContext: (request) => getState({ request }).forRequest.otel?.root,
      getOperationContext: (context) =>
        getState({ context }).forOperation.otel?.root,
      getExecutionRequestContext: (executionRequest) =>
        getState({ executionRequest }).forSubgraphExecution.otel?.root,
      ignoreRequest: (request) => ignoredRequests.add(request),
    });

    return {
      get tracer() {
        return tracer;
      },
      instrumentation: {
        request({ state: { forRequest }, request }, wrapped) {
          return unfakePromise(
            preparation$
              .then(() => {
                if (
                  !traces ||
                  !shouldTrace(traces.spans?.http, { request, ignoredRequests })
                ) {
                  return wrapped();
                }

                const url = getURL(request);

                const ctx = inheritContext
                  ? propagation.extract(
                      context.active(),
                      request.headers,
                      HeadersTextMapGetter,
                    )
                  : context.active();

                forRequest.otel = new OtelContextStack(
                  createHttpSpan({ ctx, request, tracer, url }).ctx,
                );

                if (useContextManager) {
                  wrapped = context.bind(forRequest.otel.current, wrapped);
                }

                return wrapped();
              })
              .catch((error) => {
                registerException(forRequest.otel?.current, error);
                throw error;
              })
              .finally(() => {
                const ctx = forRequest.otel?.root;
                ctx && trace.getSpan(ctx)?.end();
              }),
          );
        },

        operation(
          { context: gqlCtx, state: { forOperation, ...parentState } },
          wrapped,
        ) {
          if (
            !traces ||
            !isParentEnabled(parentState) ||
            !shouldTrace(traces.spans?.graphql, { context: gqlCtx })
          ) {
            return wrapped();
          }

          return unfakePromise(
            preparation$.then(() => {
              const ctx = getContext(parentState);
              forOperation.otel = new OtelContextStack(
                createGraphQLSpan({ tracer, ctx }),
              );

              if (useContextManager) {
                wrapped = context.bind(forOperation.otel.current, wrapped);
              }

              return fakePromise()
                .then(wrapped)
                .catch((err) => {
                  registerException(forOperation.otel?.current, err);
                  throw err;
                })
                .finally(() =>
                  trace.getSpan(forOperation.otel!.current)?.end(),
                );
            }),
          );
        },

        context({ state, context: gqlCtx }, wrapped) {
          if (
            !traces ||
            !isParentEnabled(state) ||
            !shouldTrace(traces.spans?.graphqlContextBuilding, {
              context: gqlCtx,
            })
          ) {
            return wrapped();
          }

          const { forOperation } = state;
          const ctx = getContext(state);
          forOperation.otel!.push(
            createGraphqlContextBuildingSpan({ ctx, tracer }),
          );

          if (useContextManager) {
            wrapped = context.bind(forOperation.otel!.current, wrapped);
          }

          try {
            wrapped();
          } catch (err) {
            registerException(forOperation.otel?.current, err);
            throw err;
          } finally {
            trace.getSpan(forOperation.otel!.current)?.end();
            forOperation.otel!.pop();
          }
        },

        parse({ state, context: gqlCtx }, wrapped) {
          if (
            !traces ||
            !isParentEnabled(state) ||
            !shouldTrace(traces.spans?.graphqlParse, { context: gqlCtx })
          ) {
            return wrapped();
          }

          const ctx = getContext(state);
          const { forOperation } = state;
          forOperation.otel!.push(createGraphQLParseSpan({ ctx, tracer }));

          if (useContextManager) {
            wrapped = context.bind(forOperation.otel!.current, wrapped);
          }

          try {
            wrapped();
          } catch (err) {
            registerException(forOperation.otel!.current, err);
            throw err;
          } finally {
            trace.getSpan(forOperation.otel!.current)?.end();
            forOperation.otel!.pop();
          }
        },

        validate({ state, context: gqlCtx }, wrapped) {
          if (
            !traces ||
            !isParentEnabled(state) ||
            !shouldTrace(traces.spans?.graphqlValidate, { context: gqlCtx })
          ) {
            return wrapped();
          }

          const { forOperation } = state;
          forOperation.otel!.push(
            createGraphQLValidateSpan({ ctx: getContext(state), tracer }),
          );

          if (useContextManager) {
            wrapped = context.bind(forOperation.otel!.current, wrapped);
          }

          try {
            wrapped();
          } catch (err) {
            registerException(forOperation.otel?.current, err);
            throw err;
          } finally {
            trace.getSpan(forOperation.otel!.current)?.end();
            forOperation.otel!.pop();
          }
        },

        execute({ state, context: gqlCtx }, wrapped) {
          if (
            !traces ||
            !isParentEnabled(state) ||
            !shouldTrace(traces.spans?.graphqlExecute, { context: gqlCtx })
          ) {
            // Other parenting skipping are marked by the fact that `otel` is undefined in the state
            // For execute, there is no specific state, so we keep track of it here.
            state.forOperation.skipExecuteSpan = true;
            return wrapped();
          }

          const ctx = getContext(state);
          const { forOperation } = state;
          forOperation.otel?.push(createGraphQLExecuteSpan({ ctx, tracer }));

          if (useContextManager) {
            wrapped = context.bind(forOperation.otel!.current, wrapped);
          }

          return unfakePromise(
            fakePromise()
              .then(wrapped)
              .catch((err) => {
                registerException(forOperation.otel!.current, err);
                throw err;
              })
              .finally(() => {
                trace.getSpan(forOperation.otel!.current)?.end();
                forOperation.otel!.pop();
              }),
          );
        },

        subgraphExecute(
          {
            state: { forSubgraphExecution, ...parentState },
            executionRequest,
            subgraphName,
          },
          wrapped,
        ) {
          const isIntrospection = !executionRequest.context.params;

          if (
            !traces ||
            !isParentEnabled(parentState) ||
            parentState.forOperation?.skipExecuteSpan ||
            !shouldTrace(
              isIntrospection
                ? traces.spans?.schema
                : traces.spans?.subgraphExecute,
              {
                subgraphName,
                executionRequest,
              },
            )
          ) {
            return wrapped();
          }

          // If a subgraph execution request doesn't belong to a graphql operation
          // (such as Introspection requests in proxy mode), we don't want to use the active context,
          // we want the span to be in it's own trace.
          const parentContext = isIntrospection
            ? context.active()
            : getContext(parentState);

          forSubgraphExecution.otel = new OtelContextStack(
            createSubgraphExecuteSpan({
              ctx: parentContext,
              tracer,
              executionRequest,
              subgraphName,
            }),
          );

          if (useContextManager) {
            wrapped = context.bind(forSubgraphExecution.otel!.current, wrapped);
          }

          return unfakePromise(
            fakePromise()
              .then(wrapped)
              .catch((err) => {
                registerException(forSubgraphExecution.otel!.current, err);
                throw err;
              })
              .finally(() => {
                trace.getSpan(forSubgraphExecution.otel!.current)?.end();
                forSubgraphExecution.otel!.pop();
              }),
          );
        },

        fetch({ state, executionRequest }, wrapped) {
          if (isRetryExecutionRequest(executionRequest)) {
            // Retry plugin overrides the executionRequest, by "forking" it so that multiple attempts
            // of the same execution request can be made.
            // We need to attach the fetch span to the original execution request, because attempt
            // execution requests doesn't create a new `subgraph.execute` span.
            state = getState(getRetryInfo(executionRequest));
          }

          return unfakePromise(
            preparation$.then(() => {
              if (
                !traces ||
                !isParentEnabled(state) ||
                !shouldTrace(traces.spans?.upstreamFetch, { executionRequest })
              ) {
                return wrapped();
              }

              const { forSubgraphExecution } = state;
              const ctx = createUpstreamHttpFetchSpan({
                ctx: getContext(state),
                tracer,
              });

              forSubgraphExecution?.otel!.push(ctx);

              if (useContextManager) {
                wrapped = context.bind(ctx, wrapped);
              }

              return fakePromise()
                .then(wrapped)
                .catch((err) => {
                  registerException(ctx, err);
                  throw err;
                })
                .finally(() => {
                  trace.getSpan(ctx)?.end();
                  forSubgraphExecution?.otel!.pop();
                });
            }),
          );
        },

        schema(_, wrapped) {
          return unfakePromise(
            preparation$.then(() => {
              if (!traces || !shouldTrace(traces.spans?.schema, null)) {
                return wrapped();
              }

              const ctx = createSchemaLoadingSpan({
                ctx: initSpan ?? ROOT_CONTEXT,
                tracer,
              });
              return fakePromise()
                .then(() => context.with(ctx, wrapped))
                .catch((err) => {
                  trace.getSpan(ctx)?.recordException(err);
                })
                .finally(() => {
                  trace.getSpan(ctx)?.end();
                });
            }),
          );
        },
      },

      onYogaInit({ yoga }) {
        //TODO remove this when Yoga will also use the new Logger API
        pluginLogger ??= new Logger({
          writers: [
            {
              write(level, attrs, msg) {
                level = level === 'trace' ? 'debug' : level;
                yoga.logger[level](msg, attrs);
              },
            },
          ],
        }).child('[OpenTelemetry] ');

        pluginLogger.debug(
          `Context manager is ${useContextManager ? 'enabled' : 'disabled'}`,
        );
      },

      onRequest({ state, serverContext }) {
        // When running in a runtime without a context manager, we have to keep track of the
        // span correlated to a log manually. For now, we just link all logs for a request to
        // the HTTP root span
        if (traces && !useContextManager) {
          const requestId =
            // TODO: serverContext.log will not be available in Yoga, this will be fixed when Hive Logger is integrated into Yoga
            serverContext.log?.attrs?.[
              // @ts-expect-error even if the attrs is an array this will work
              'requestId'
            ];

          if (typeof requestId === 'string') {
            const httpCtx = state.forRequest.otel?.root;
            const httpSpan = httpCtx && trace.getSpan(httpCtx);
            httpSpan?.setAttribute(SEMATTRS_HIVE_REQUEST_ID, requestId);
            otelCtxForRequestId.set(requestId, getContext(state));
          }
        }
      },

      onEnveloped({ state, extendContext }) {
        extendContext({
          openTelemetry: {
            tracer,
            getHttpContext: (request) => {
              const { forRequest } = request ? getState({ request }) : state;
              return forRequest.otel?.root;
            },
            getOperationContext: (context) => {
              const { forOperation } = context ? getState({ context }) : state;
              return forOperation.otel?.root;
            },
            getExecutionRequestContext: (executionRequest) => {
              return getState({ executionRequest }).forSubgraphExecution.otel
                ?.root;
            },
            getActiveContext: (
              contextMatcher?: Parameters<typeof getState>[0],
            ) => getContext(contextMatcher ? getState(contextMatcher) : state),
          },
        });
      },

      onCacheGet: (payload) =>
        traces &&
        shouldTrace(traces.events?.cache, { key: payload.key, action: 'read' })
          ? {
              onCacheMiss: () => recordCacheEvent('miss', payload),
              onCacheHit: () => recordCacheEvent('hit', payload),
              onCacheGetError: ({ error }) =>
                recordCacheError('read', error, payload),
            }
          : undefined,

      onCacheSet: (payload) =>
        traces &&
        shouldTrace(traces.events?.cache, { key: payload.key, action: 'write' })
          ? {
              onCacheSetDone: () => recordCacheEvent('write', payload),
              onCacheSetError: ({ error }) =>
                recordCacheError('write', error, payload),
            }
          : undefined,

      onResponse({ response, state, serverContext }) {
        traces &&
          state.forRequest.otel &&
          setResponseAttributes(state.forRequest.otel.root, response);

        // Clean up Logging context tracking for runtimes without context manager
        if (!useContextManager) {
          const requestId =
            // TODO: serverContext.log will not be available in Yoga, this will be fixed when Hive Logger is integrated into Yoga
            serverContext.log?.attrs?.[
              // @ts-expect-error even if the attrs is an array this will work
              'requestId'
            ];
          if (typeof requestId === 'string') {
            otelCtxForRequestId.delete(requestId);
          }
        }
      },

      onParams({ state, context: gqlCtx, params }) {
        if (
          !traces ||
          !isParentEnabled(state) ||
          !shouldTrace(traces.spans?.graphql, { context: gqlCtx })
        ) {
          return;
        }

        const ctx = getContext(state);
        setParamsAttributes({ ctx, params });
      },

      onExecutionResult({ result, context: gqlCtx, state }) {
        if (
          !traces ||
          !isParentEnabled(state) ||
          !shouldTrace(traces.spans?.graphql, { context: gqlCtx })
        ) {
          return;
        }

        setExecutionResultAttributes({ ctx: getContext(state), result });
      },

      onParse({ state, context: gqlCtx }) {
        if (
          !traces ||
          !isParentEnabled(state) ||
          !shouldTrace(traces.spans?.graphqlParse, { context: gqlCtx })
        ) {
          return;
        }

        return ({ result }) => {
          setGraphQLParseAttributes({
            ctx: getContext(state),
            operationName: gqlCtx.params.operationName,
            query: gqlCtx.params.query?.trim(),
            result,
          });
          if (!(result instanceof Error)) {
            setDocumentAttributesOnOperationSpan({
              ctx: state.forOperation.otel!.root,
              document: result,
              operationName: gqlCtx.params.operationName,
            });
          }
        };
      },

      onValidate({ state, context: gqlCtx, params }) {
        if (
          !traces ||
          !isParentEnabled(state) ||
          !shouldTrace(traces.spans?.graphqlValidate, { context: gqlCtx })
        ) {
          return;
        }

        return ({ result }) => {
          setGraphQLValidateAttributes({
            ctx: getContext(state),
            result,
            document: params.documentAST,
            operationName: gqlCtx.params.operationName,
          });
        };
      },

      onExecute({ state, args }) {
        // Check for execute span is done in `instrument.execute`
        if (state.forOperation.skipExecuteSpan) {
          return;
        }

        const ctx = getContext(state);
        setGraphQLExecutionAttributes({
          ctx,
          operationCtx: state.forOperation.otel!.root,
          args,
          hashOperationFn: options.hashOperation,
        });

        state.forOperation.subgraphNames = [];

        return {
          onExecuteDone({ result }) {
            setGraphQLExecutionResultAttributes({
              ctx,
              result,
              subgraphNames: state.forOperation.subgraphNames,
            });
          },
        };
      },

      onSubgraphExecute({ subgraphName, state }) {
        // Keep track of the list of subgraphs that has been hit for this operation
        // This list will be added as attribute on onExecuteDone hook
        state.forOperation?.subgraphNames?.push(subgraphName);
      },

      onFetch(payload) {
        const { url, setFetchFn, fetchFn, executionRequest } = payload;
        let { state } = payload;

        if (executionRequest && isRetryExecutionRequest(executionRequest)) {
          // Retry plugin overrides the executionRequest, by "forking" it so that multiple attempts
          // of the same execution request can be made.
          // We need to attach the fetch span to the original execution request, because attempt
          // execution requests doesn't create a new `subgraph.execute` span.
          state = getState(getRetryInfo(executionRequest));
        }

        // We want to always propagate context, even if we are not tracing the fetch phase.
        if (propagateContext) {
          setFetchFn((url, options, ...args) => {
            const reqHeaders = getHeadersObj(options?.headers || {});
            propagation.inject(getContext(state), reqHeaders);
            return fetchFn(url, { ...options, headers: reqHeaders }, ...args);
          });
        }

        if (
          !traces ||
          !isParentEnabled(state) ||
          !shouldTrace(traces.spans?.upstreamFetch, { executionRequest })
        ) {
          return;
        }

        const ctx = getContext(state);

        setUpstreamFetchAttributes({
          ctx,
          url,
          options: payload.options,
          executionRequest,
        });

        return ({ response }) => {
          setUpstreamFetchResponseAttributes({ ctx, response });
        };
      },

      onSchemaChange(payload) {
        if (initSpan) {
          trace.getSpan(initSpan)?.end();
          initSpan = null;
        }

        if (!traces || !shouldTrace(traces?.spans?.schema, null)) {
          setSchemaAttributes(payload);
        }
      },

      onDispose() {
        if (options.flushOnDispose !== false) {
          const flushMethod = options.flushOnDispose ?? 'forceFlush';

          const provider = trace.getTracerProvider() as Record<string, any>;
          if (
            flushMethod in provider &&
            typeof provider[flushMethod] === 'function'
          ) {
            return provider[flushMethod]();
          }
        }
      },
    };
  }) as OpenTelemetryPlugin;

  plugin.getActiveContext = hive.getActiveContext;
  plugin.getHttpContext = hive.getHttpContext;
  plugin.getOperationContext = hive.getOperationContext;
  plugin.getExecutionRequestContext = hive.getExecutionRequestContext;
  plugin.ignoreRequest = hive.ignoreRequest;
  Object.defineProperty(plugin, 'tracer', {
    enumerable: true,
    get: () => tracer,
  });

  return plugin;
}

function shouldTrace<Args>(
  value: BooleanOrPredicate<Args> | null | undefined,
  args: Args,
): boolean {
  if (value == null) {
    return true;
  }
  if (typeof value === 'function') {
    return value(args);
  }
  return value;
}

function getURL(request: Request) {
  if ('parsedUrl' in request) {
    // It is a `whatwg-node/fetch` request which already contains a parsed URL object
    return request.parsedUrl as URL;
  }

  return new URL(request.url, 'http://localhost'); // to be iso with whatwg-node/server behavior
}

export const defaultHttpFilter: SpansConfig['http'] = ({ request }) => {
  if (ignoredRequests.has(request)) {
    return false;
  }

  return true;
};

/**
 * Resolves the traces config.
 * Returns `undefined` if tracing is disabled
 */
function resolveTracesConfig(
  options: OpenTelemetryGatewayPluginOptions,
  useContextManager: boolean,
  log?: Logger,
): TracesConfig | undefined {
  if (options.traces === false) {
    return undefined;
  }

  let traces: TracesConfig =
    typeof options.traces === 'object' ? options.traces : {};

  traces.spans ??= {};

  // Only override http filter if it's not disabled or already a function
  if ((traces.spans.http ?? true) === true) {
    traces.spans = { ...traces.spans, http: defaultHttpFilter };
  }

  // Schema span is only working with a context manager, otherwise we can't correlate its sub-spans
  if (!useContextManager) {
    if (traces.spans.schema) {
      log?.warn(
        'Schema loading spans are disabled because no context manager is available',
      );
    }

    traces.spans.schema = false;
  }

  return traces;
}
