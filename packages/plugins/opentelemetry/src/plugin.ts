import {
  GatewayConfigContext,
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
import '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { unfakePromise } from '@whatwg-node/promise-helpers';
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
  registerException,
  setExecutionAttributesOnOperationSpan,
  setGraphQLExecutionAttributes,
  setGraphQLExecutionResultAttributes,
  setGraphQLParseAttributes,
  setGraphQLValidateAttributes,
  setParamsAttributes,
  setResponseAttributes,
  setUpstreamFetchAttributes,
  setUpstreamFetchResponseAttributes,
} from './spans';

type BooleanOrPredicate<TInput = never> =
  | boolean
  | ((input: TInput) => boolean);

interface OpenTelemetryGatewayPluginOptionsWithoutInit {
  /**
   * Whether to initialize the OpenTelemetry SDK (default: true).
   */
  initializeNodeSDK: false;
  /**
   * Whether to rely on OTEL context api for span correlation (default: true).
   * If false, the plugin will rely on request context for span parenting,
   * which implies that any user defined context and spans will be ignored.
   */
  contextManager?: false;
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
   * The context manager used to keep track of the OTEL context.
   * By default, it uses AsyncLocalStorage based manager, which is compatible only in Node.
   *
   * Does not apply when `initializeNodeSDK` is `false`.
   */
  contextManager?: ContextManager | false;
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
    logger: GatewayConfigContext['logger'];
  },
): OpenTelemetryPlugin {
  const inheritContext = options.inheritContext ?? true;
  const propagateContext = options.propagateContext ?? true;
  const useContextManager = options.contextManager !== false;

  let tracer: Tracer;

  let spanProcessors: SpanProcessor[];
  let provider: WebTracerProvider;

  const { promise: asyncAttributes, resolve: resolveAsyncAttributes } =
    createDeferred<{ [ATTR_SERVICE_VERSION]: string }>();

  function isParentEnabled(state: State): boolean {
    const parentState = getMostSpecificState(state);
    return !parentState || !!parentState.otel;
  }

  function getContext(state?: State): Context {
    return useContextManager
      ? context.active()
      : (getMostSpecificState(state)?.otel?.current ?? ROOT_CONTEXT);
  }

  const pluginLogger = options.logger.child({ plugin: 'OpenTelemetry' });
  diag.setLogger(
    {
      error: (message, ...args) => pluginLogger.error(message, ...args),
      warn: (message, ...args) => pluginLogger.warn(message, ...args),
      info: (message, ...args) => pluginLogger.info(message, ...args),
      debug: (message, ...args) => pluginLogger.debug(message, ...args),
      verbose: (message, ...args) => pluginLogger.debug(message, ...args),
    },
    DiagLogLevel.VERBOSE,
  );

  let preparation$: Promise<void>;
  if ('initializeNodeSDK' in options && options.initializeNodeSDK === false) {
    preparation$ = fakePromise();
    tracer = options.tracer || trace.getTracer('gateway');
  } else {
    const exporters$ = fakePromise(
      containsOnlyValues(options.exporters)
        ? options.exporters
        : Promise.all(options.exporters),
    );

    const resource = new Resource(
      { [SEMRESATTRS_SERVICE_NAME]: options.serviceName || 'Gateway' },
      asyncAttributes,
    );

    let contextManager$ = getContextManager(
      pluginLogger,
      useContextManager,
      options.contextManager,
    );

    preparation$ = exporters$
      .then((exporters) => {
        spanProcessors = exporters;
        provider = new WebTracerProvider({ resource, spanProcessors });
        return contextManager$;
      })
      .then((contextManager) => {
        provider.register({
          contextManager: contextManager === false ? undefined : contextManager,
        });
        tracer = options.tracer || trace.getTracer('gateway');
        preparation$ = fakePromise();
      });
  }

  return withState<
    OpenTelemetryPlugin,
    OtelState,
    OtelState & { skipExecuteSpan?: true },
    OtelState
  >({
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
        if (
          !isParentEnabled(parentState) ||
          parentState.forOperation?.skipExecuteSpan ||
          !shouldTrace(options.spans?.subgraphExecute, {
            subgraphName,
            executionRequest,
          })
        ) {
          return wrapped();
        }

        forSubgraphExecution.otel = new OtelContextStack(
          createSubgraphExecuteFetchSpan({
            ctx: getContext(parentState),
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
      resolveAsyncAttributes({ [ATTR_SERVICE_VERSION]: yoga.version });
    },

    onEnveloped({ state, extendContext }) {
      extendContext({
        opentelemetry: {
          tracer,
          activeContext: () => getContext(state),
        },
      });
    },

    onResponse({ response, state }) {
      try {
        state.forRequest.otel &&
          setResponseAttributes(state.forRequest.otel.root, response);
      } catch (error) {
        pluginLogger.error('Failed to end http span', { error });
      }
    },

    onParams({ state, context: gqlCtx, params }) {
      if (
        !isParentEnabled(state) ||
        !shouldTrace(options.spans?.graphql, gqlCtx)
      ) {
        return;
      }

      const ctx = getContext(state);
      setParamsAttributes({ ctx, params });
    },

    onParse({ state, context: gqlCtx }) {
      if (
        !isParentEnabled(state) ||
        !shouldTrace(options.spans?.graphqlParse, gqlCtx)
      ) {
        return;
      }

      return (result) => {
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
      const { state, url, setFetchFn, fetchFn, executionRequest } = payload;

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

      setUpstreamFetchAttributes({ ctx, url, options: payload.options });

      return ({ response }) => {
        setUpstreamFetchResponseAttributes({ ctx, response });
      };
    },
    async onDispose() {
      await provider?.forceFlush?.();
      await provider?.shutdown?.();

      diag.disable();
      trace.disable();
      context.disable();
      propagation.disable();
    },
  });
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
