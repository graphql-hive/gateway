import {
  Attributes,
  getRetryInfo,
  isRetryExecutionRequest,
  Logger,
  type GatewayPlugin,
} from '@graphql-hive/gateway-runtime';
import { getHeadersObj } from '@graphql-mesh/utils';
import { ExecutionRequest, fakePromise } from '@graphql-tools/utils';
import {
  context,
  diag,
  propagation,
  ROOT_CONTEXT,
  trace,
  type Context,
  type TextMapGetter,
  type Tracer,
} from '@opentelemetry/api';
import { setGlobalErrorHandler } from '@opentelemetry/core';
import { unfakePromise } from '@whatwg-node/promise-helpers';
import { OtelContextStack } from './context';
import {
  getMostSpecificState,
  withState,
  type GatewayState,
  type GraphQLState,
  type HttpState,
} from './plugin-utils';
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
  recordCacheError,
  recordCacheEvent,
  registerException,
  setExecutionAttributesOnOperationSpan,
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
import {
  diagLogLevelFromEnv,
  isContextManagerCompatibleWithAsync,
} from './utils';

const initializationTime =
  'performance' in globalThis ? performance.now() : undefined;

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
   * Configure Opentelemetry `diag` API to use Gateway's logger.
   *
   * @default true
   
   * Note: Logger configuration respects OTEL environment variables standard.
   *       This means that the logger will be enabled only if `OTEL_LOG_LEVEL` variable is set.
   */
  configureDiagLogger?: boolean;
  /**
   * The TraceProvider method to call on Gateway's disposal. By default, it tries to run `forceFlush` method on
   * the registered trace provider if it exists.
   * Set to `false` to disable this behavior.
   * @default 'forceFlush'
   */
  flushOnDispose?: string | false;
  /**
   * Tracing configuration
   */
  traces?:
    | boolean
    | {
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
        spans?: {
          /**
           * Enable/disable HTTP request spans (default: true).
           *
           * Disabling the HTTP span will also disable all other child spans.
           */
          http?: BooleanOrPredicate<{ request: Request }>;
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
        events?: {
          /**
           * Enable/Disable cache related span events (default: true).
           */
          cache?: BooleanOrPredicate<{ key: string; action: 'read' | 'write' }>;
        };
      };
};

const HeadersTextMapGetter: TextMapGetter<Headers> = {
  keys(carrier) {
    return [...carrier.keys()];
  },
  get(carrier, key) {
    return carrier.get(key) || undefined;
  },
};

export type OpenTelemetryContextExtension = {
  opentelemetry: {
    tracer: Tracer;
    activeContext: () => Context;
  };
};

type OtelState = {
  otel: OtelContextStack;
};

type State = Partial<
  HttpState<OtelState> & GraphQLState<OtelState> & GatewayState<OtelState>
>;

export type OpenTelemetryPlugin =
  GatewayPlugin<OpenTelemetryContextExtension> & {
    getOtelContext: (payload: {
      request?: Request;
      context?: any;
      executionRequest?: ExecutionRequest;
    }) => Context;
    getTracer(): Tracer;
  };

export function useOpenTelemetry(
  options: OpenTelemetryGatewayPluginOptions & {
    log: Logger;
  },
): OpenTelemetryPlugin {
  const inheritContext = options.inheritContext ?? true;
  const propagateContext = options.propagateContext ?? true;
  let useContextManager: boolean;
  const traces = typeof options.traces === 'object' ? options.traces : {};

  let tracer: Tracer;
  let pluginLogger: Logger;
  let initSpan: Context | null;

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

    tracer = traces.tracer || trace.getTracer('gateway');

    initSpan = trace.setSpan(
      context.active(),
      tracer.startSpan('gateway.initialization', {
        startTime: initializationTime,
      }),
    );

    if (!useContextManager) {
      if (traces.spans?.schema) {
        pluginLogger.warn(
          'Schema loading spans are disabled because no context manager is available',
        );
      }

      traces.spans = traces.spans ?? {};
      traces.spans.schema = false;
    }
  }

  return withState<
    OpenTelemetryPlugin,
    OtelState,
    OtelState & { skipExecuteSpan?: true },
    OtelState
  >((getState) => ({
    getTracer: () => tracer,
    getOtelContext: ({ state }) => getContext(state),
    instrumentation: {
      request({ state: { forRequest }, request }, wrapped) {
        if (!shouldTrace(traces.spans?.http, { request })) {
          return wrapped();
        }

        const url = getURL(request);

        return unfakePromise(
          preparation$
            .then(() => {
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
              .finally(() => trace.getSpan(forOperation.otel!.current)?.end());
          }),
        );
      },

      context({ state, context: gqlCtx }, wrapped) {
        if (
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
          !isParentEnabled(state) ||
          !shouldTrace(traces.spans?.graphqlValidate, { context: gqlCtx })
        ) {
          return wrapped();
        }

        const { forOperation } = state;
        forOperation.otel!.push(
          createGraphQLValidateSpan({
            ctx: getContext(state),
            tracer,
            query: gqlCtx.params.query?.trim(),
            operationName: gqlCtx.params.operationName,
          }),
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

        if (
          !isParentEnabled(state) ||
          !shouldTrace(traces.spans?.upstreamFetch, { executionRequest })
        ) {
          return wrapped();
        }

        return unfakePromise(
          preparation$.then(() => {
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
        if (!shouldTrace(traces.spans?.schema, null)) {
          return wrapped();
        }

        return unfakePromise(
          preparation$.then(() => {
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
      const log =
        options.log ??
        //TODO remove this when Yoga will also use the new Logger API
        new Logger({
          writers: [
            {
              write(level, attrs, msg) {
                level = level === 'trace' ? 'debug' : level;
                yoga.logger[level](msg, attrs);
              },
            },
          ],
        });

      pluginLogger = log.child('[useOpenTelemetry]');

      if (options.configureDiagLogger !== false) {
        const logLevel = diagLogLevelFromEnv(); // We enable the diag only if it is explicitly enabled, as NodeSDK does
        if (logLevel) {
          const diagLog = pluginLogger.child('[diag] ') as Logger & {
            verbose: Logger['trace'];
          };
          diagLog.verbose = diagLog.trace;
          diag.setLogger(diagLog, logLevel);
          setGlobalErrorHandler((err) => diagLog.error(err as Attributes));
        }
      }

      pluginLogger.debug(
        `context manager is ${useContextManager ? 'enabled' : 'disabled'}`,
      );
    },

    onEnveloped({ state, extendContext }) {
      extendContext({
        opentelemetry: {
          tracer,
          activeContext: () => getContext(state),
        },
      });
    },

    onCacheGet: (payload) =>
      shouldTrace(traces.events?.cache, { key: payload.key, action: 'read' })
        ? {
            onCacheMiss: () => recordCacheEvent('miss', payload),
            onCacheHit: () => recordCacheEvent('hit', payload),
            onCacheGetError: ({ error }) =>
              recordCacheError('read', error, payload),
          }
        : undefined,

    onCacheSet: (payload) =>
      shouldTrace(traces.events?.cache, { key: payload.key, action: 'write' })
        ? {
            onCacheSetDone: () => recordCacheEvent('write', payload),
            onCacheSetError: ({ error }) =>
              recordCacheError('write', error, payload),
          }
        : undefined,

    onResponse({ response, state }) {
      try {
        state.forRequest.otel &&
          setResponseAttributes(state.forRequest.otel.root, response);
      } catch (error) {
        pluginLogger!.error('Failed to end http span', { error });
      }
    },

    onParams: function onParamsOTEL({ state, context: gqlCtx, params }) {
      if (
        !isParentEnabled(state) ||
        !shouldTrace(traces.spans?.graphql, { context: gqlCtx })
      ) {
        return;
      }

      const ctx = getContext(state);
      setParamsAttributes({ ctx, params });
    },

    onExecutionResult: function onExeResOTEL({
      result,
      context: gqlCtx,
      state,
    }) {
      if (
        !isParentEnabled(state) ||
        !shouldTrace(traces.spans?.graphql, { context: gqlCtx })
      ) {
        return;
      }

      setExecutionResultAttributes({ ctx: getContext(state), result });
    },

    onParse({ state, context: gqlCtx }) {
      if (
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
      };
    },

    onValidate({ state, context: gqlCtx }) {
      if (
        !isParentEnabled(state) ||
        !shouldTrace(traces.spans?.graphqlValidate, { context: gqlCtx })
      ) {
        return;
      }

      return ({ result }) => {
        setGraphQLValidateAttributes({ ctx: getContext(state), result });
      };
    },

    onExecute({ state, args }) {
      if (!isParentEnabled(state)) {
        return;
      }

      setExecutionAttributesOnOperationSpan(
        state.forOperation.otel!.root,
        args,
      );

      if (state.forOperation.skipExecuteSpan) {
        return;
      }

      const ctx = getContext(state);
      setGraphQLExecutionAttributes({ ctx, args });

      return {
        onExecuteDone({ result }) {
          setGraphQLExecutionResultAttributes({ ctx, result });
        },
      };
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
      setSchemaAttributes(payload);

      if (initSpan) {
        trace.getSpan(initSpan)?.end();
        initSpan = null;
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
  }));
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
