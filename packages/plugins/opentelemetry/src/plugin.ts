import {
  getRetryInfo,
  isRetryExecutionRequest,
  type GatewayConfigContext,
  type GatewayPlugin,
} from '@graphql-hive/gateway-runtime';
import { getHeadersObj } from '@graphql-mesh/utils';
import {
  createDeferred,
  ExecutionRequest,
  fakePromise,
  isPromise,
  MaybePromise,
} from '@graphql-tools/utils';
import {
  context,
  diag,
  DiagLogLevel,
  propagation,
  ROOT_CONTEXT,
  trace,
  type Context,
  type ContextManager,
  type TextMapGetter,
  type Tracer,
} from '@opentelemetry/api';
import { setGlobalErrorHandler } from '@opentelemetry/core';
import {
  detectResources,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { unfakePromise } from '@whatwg-node/promise-helpers';
import { YogaLogger } from 'graphql-yoga';
import { ATTR_SERVICE_VERSION, SEMRESATTRS_SERVICE_NAME } from './attributes';
import { getContextManager, OtelContextStack } from './context';
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
  startSubgraphExecuteFetchSpan as createSubgraphExecuteFetchSpan,
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
  setUpstreamFetchAttributes,
  setUpstreamFetchResponseAttributes,
} from './spans';
import { tryContextManagerSetup } from './utils';

type BooleanOrPredicate<TInput = never> =
  | boolean
  | ((input: TInput) => boolean);

interface OpenTelemetryGatewayPluginOptionsWithoutInit {
  /**
   * Whether to initialize the OpenTelemetry SDK (default: true).
   */
  initializeNodeSDK: false;
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
  contextManager?: boolean;
}

interface OpenTelemetryGatewayPluginOptionsWithInit {
  /**
   * Whether to initialize the OpenTelemetry SDK (default: true).
   */
  initializeNodeSDK?: true;
  /**
   * A list of OpenTelemetry exporters to use for exporting the spans.
   * You can use exporters from `@opentelemetry/exporter-*` packages, or use the built-in utility functions.
   *
   * Does not apply when `initializeNodeSDK` is `false`.
   */
  exporters: MaybePromise<SpanProcessor>[];
  /**
   * Service name to use for OpenTelemetry NodeSDK resource option (default: 'Gateway').
   *
   * Does not apply when `initializeNodeSDK` is `false`.
   */
  serviceName?: string;
  /**
   * Whether to rely on OTEL context api for span correlation.
   *  - `undefined` (default): the plugin will try to enable context manager if possible.
   *  - `false`: the plugin will rely on request context for span parenting,
   *             which implies that any user defined context and spans will be ignored.
   *  - `true`: the plugin will rely on AsyncLocalStorage based context manager.
   *            Note that `async_hooks` module must be available, otherwise provide a custom `ContextManager` instance.
   *  - `ContextManager`: rely on this provided `ContextManger` instance.
   */
  contextManager?: ContextManager | boolean;
}

type OpenTelemetryGatewayPluginOptionsInit =
  | OpenTelemetryGatewayPluginOptionsWithInit
  | OpenTelemetryGatewayPluginOptionsWithoutInit;

export type OpenTelemetryGatewayPluginOptions =
  OpenTelemetryGatewayPluginOptionsInit & {
    /**
     * Tracer instance to use for creating spans (default: a tracer with name 'gateway').
     */
    tracer?: Tracer;
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
     * The level of verbosity of OTEL diagnostic logs.
     * @default Verbose
     */
    diagLevel?: DiagLogLevel;
    /**
     * Options to control which spans to create.
     * By default, all spans are enabled.
     *
     * You may specify a boolean value to enable/disable all spans, or a function to dynamically enable/disable spans based on the input.
     */
    spans?: {
      /**
       * Enable/disable Spans of internal introspection queries in proxy mode (default: true).
       */
      introspection?: BooleanOrPredicate<{
        executionRequest: ExecutionRequest;
        subgraphName: string;
      }>;
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
      graphql?: BooleanOrPredicate<unknown>; // FIXME: better type for graphql context
      /**
       * Enable/disable GraphQL context building phase (default: true).
       */
      graphqlContextBuilding?: BooleanOrPredicate<unknown>; // FIXME: better type for graphql context
      /**
       * Enable/disable GraphQL parse spans (default: true).
       */
      graphqlParse?: BooleanOrPredicate<unknown>; // FIXME: better type for graphql context
      /**
       * Enable/disable GraphQL validate spans (default: true).
       */
      graphqlValidate?: BooleanOrPredicate<unknown>;
      /**
       * Enable/disable GraphQL execute spans (default: true).
       *
       * Disabling the GraphQL execute spans will also disable all other child spans.
       */
      graphqlExecute?: BooleanOrPredicate<unknown>;
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
      upstreamFetch?: BooleanOrPredicate<ExecutionRequest | undefined>;
      /**
       * Enable/Disable cache related span events (default: true).
       */
      cache?: BooleanOrPredicate<{ key: string; action: 'read' | 'write' }>;
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
    logger?: GatewayConfigContext['logger'];
  },
): OpenTelemetryPlugin {
  const inheritContext = options.inheritContext ?? true;
  const propagateContext = options.propagateContext ?? true;
  let useContextManager: boolean;

  let tracer: Tracer;

  let spanProcessors: SpanProcessor[];
  let provider: WebTracerProvider;

  const yogaVersion = createDeferred<string>();

  function isParentEnabled(state: State): boolean {
    const parentState = getMostSpecificState(state);
    return !parentState || !!parentState.otel;
  }

  function getContext(state?: State): Context {
    return useContextManager
      ? context.active()
      : (getMostSpecificState(state)?.otel?.current ?? ROOT_CONTEXT);
  }

  const yogaLogger = createDeferred<YogaLogger>();
  let pluginLogger = options.logger
    ? fakePromise(
        options.logger.child({
          plugin: 'OpenTelemetry',
        }),
      )
    : yogaLogger.promise;

  function init(): Promise<boolean> {
    if ('initializeNodeSDK' in options && options.initializeNodeSDK === false) {
      if (options.contextManager === false) {
        return fakePromise(false);
      }

      if (
        options.contextManager === true ||
        options.contextManager == undefined
      ) {
        return tryContextManagerSetup(options.contextManager);
      }

      if (context.setGlobalContextManager(options.contextManager)) {
        return fakePromise(true);
      } else {
        throw new Error(
          '[OTEL] The provided context manager failed to register, a context manger is already registered.',
        );
      }
    }

    const exporters$ = fakePromise(
      containsOnlyValues(options.exporters)
        ? options.exporters
        : Promise.all(options.exporters),
    );

    const resource = detectResources().merge(
      resourceFromAttributes({
        [SEMRESATTRS_SERVICE_NAME]: options.serviceName ?? 'Gateway',
        [ATTR_SERVICE_VERSION]: yogaVersion.promise,
      }),
    );

    let contextManager$ = getContextManager(options.contextManager);

    setGlobalErrorHandler((err) => {
      diag.error('Uncaught Error', err);
    });

    return exporters$
      .then((exporters) => {
        spanProcessors = exporters;
        provider = new WebTracerProvider({ resource, spanProcessors });
        return contextManager$;
      })
      .then((contextManager) => {
        provider.register({ contextManager });
        return !!contextManager;
      });
  }

  let preparation$: Promise<void>;
  preparation$ = init().then((contextManager) => {
    useContextManager = contextManager;
    tracer = options.tracer || trace.getTracer('gateway');
    preparation$ = fakePromise();
    return pluginLogger.then((logger) => {
      pluginLogger = fakePromise(logger);
      logger.debug(
        `context manager is ${useContextManager ? 'enabled' : 'disabled'}`,
      );
      diag.setLogger(
        {
          error: (message, ...args) =>
            logger.error('[otel-diag] ' + message, ...args),
          warn: (message, ...args) =>
            logger.warn('[otel-diag] ' + message, ...args),
          info: (message, ...args) =>
            logger.info('[otel-diag] ' + message, ...args),
          debug: (message, ...args) =>
            logger.debug('[otel-diag] ' + message, ...args),
          verbose: (message, ...args) =>
            logger.debug('[otel-diag] ' + message, ...args),
        },
        options.diagLevel ?? DiagLogLevel.VERBOSE,
      );
    });
  });

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
        if (!shouldTrace(options.spans?.http, { request })) {
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
          !shouldTrace(options.spans?.graphql, gqlCtx)
        ) {
          return wrapped();
        }

        const ctx = getContext(parentState);
        forOperation.otel = new OtelContextStack(
          createGraphQLSpan({ tracer, ctx }),
        );

        if (useContextManager) {
          wrapped = context.bind(forOperation.otel.current, wrapped);
        }

        return unfakePromise(
          fakePromise()
            .then(wrapped)
            .catch((err) => {
              registerException(forOperation.otel?.current, err);
              throw err;
            })
            .finally(() => trace.getSpan(forOperation.otel!.current)?.end()),
        );
      },

      context({ state, context: gqlCtx }, wrapped) {
        if (
          !isParentEnabled(state) ||
          !shouldTrace(options.spans?.graphqlContextBuilding, gqlCtx)
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
          !shouldTrace(options.spans?.graphqlParse, gqlCtx)
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
          !shouldTrace(options.spans?.graphqlValidate, gqlCtx)
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
          !shouldTrace(options.spans?.graphqlExecute, gqlCtx)
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
              ? options.spans?.introspection
              : options.spans?.subgraphExecute,
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
          ? ROOT_CONTEXT
          : getContext(parentState);

        forSubgraphExecution.otel = new OtelContextStack(
          createSubgraphExecuteFetchSpan({
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
          !shouldTrace(options.spans?.upstreamFetch, executionRequest)
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

        return unfakePromise(
          fakePromise()
            .then(wrapped)
            .catch((err) => {
              registerException(ctx, err);
              throw err;
            })
            .finally(() => {
              trace.getSpan(ctx)?.end();
              forSubgraphExecution?.otel!.pop();
            }),
        );
      },
    },

    onYogaInit({ yoga }) {
      yogaVersion.resolve(yoga.version);
      yogaLogger.resolve(yoga.logger);
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
      shouldTrace(options.spans?.cache, { key: payload.key, action: 'read' })
        ? {
            onCacheMiss: () => recordCacheEvent('miss', payload),
            onCacheHit: () => recordCacheEvent('hit', payload),
            onCacheGetError: ({ error }) =>
              recordCacheError('read', error, payload),
          }
        : undefined,

    onCacheSet: (payload) =>
      shouldTrace(options.spans?.cache, { key: payload.key, action: 'write' })
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
        pluginLogger.then((l) => l.error('Failed to end http span', { error }));
      }
    },

    onParams: function onParamsOTEL({ state, context: gqlCtx, params }) {
      if (
        !isParentEnabled(state) ||
        !shouldTrace(options.spans?.graphql, gqlCtx)
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
        !shouldTrace(options.spans?.graphql, gqlCtx)
      ) {
        return;
      }

      setExecutionResultAttributes({ ctx: getContext(state), result });
    },

    onParse({ state, context: gqlCtx }) {
      if (
        !isParentEnabled(state) ||
        !shouldTrace(options.spans?.graphqlParse, gqlCtx)
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
        !shouldTrace(options.spans?.graphqlValidate, gqlCtx)
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
        !shouldTrace(options.spans?.upstreamFetch, executionRequest)
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
    async onDispose() {
      if (options.initializeNodeSDK) {
        await provider?.forceFlush?.();
        await provider?.shutdown?.();

        diag.disable();
        trace.disable();
        context.disable();
        propagation.disable();
      }
    },
  }));
}

function containsOnlyValues<T>(
  maybePromises: MaybePromise<T>[],
): maybePromises is T[] {
  return !maybePromises.some(isPromise);
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
