import {
  type OnEnvelopedHookEventPayload,
  type OnExecuteEventPayload,
  type OnParseEventPayload,
  type OnValidateEventPayload,
} from '@envelop/types';
import { type GatewayPlugin } from '@graphql-hive/gateway-runtime';
import type { OnSubgraphExecutePayload } from '@graphql-mesh/fusion-runtime';
import type {
  Logger,
  OnFetchHookDone,
  OnFetchHookPayload,
} from '@graphql-mesh/types';
import { getHeadersObj } from '@graphql-mesh/utils';
import { createDeferred, isPromise, MaybePromise } from '@graphql-tools/utils';
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
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { type OnRequestEventPayload } from '@whatwg-node/server';
import { ATTR_SERVICE_VERSION, SEMRESATTRS_SERVICE_NAME } from './attributes';
import { OtelContextStack } from './contextManager';
import {
  withState,
  type GatewayState,
  type GraphQLState,
  type HttpState,
} from './plugin-utils';
import {
  createHttpSpan,
  endGraphQLSpan,
  endHttpSpan,
  startGraphQLExecuteSpan,
  startGraphQLParseSpan,
  startGraphQLSpan,
  startGraphQLValidateSpan,
  startSubgraphExecuteFetchSpan,
  startUpstreamHttpFetchSpan,
} from './spans';
import { mapMaybePromise } from './utils';

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
      http?: BooleanOrPredicate<OnRequestEventPayload<any>>;
      /**
       * Enable/disable GraphQL operation spans (default: true).
       */
      graphql?: BooleanOrPredicate<OnEnvelopedHookEventPayload<unknown>>;
      /**
       * Enable/disable GraphQL parse spans (default: true).
       */
      graphqlParse?: BooleanOrPredicate<OnParseEventPayload<any>>;
      /**
       * Enable/disable GraphQL validate spans (default: true).
       */
      graphqlValidate?: BooleanOrPredicate<OnValidateEventPayload<any>>;
      /**
       * Enable/disable GraphQL execute spans (default: true).
       */
      graphqlExecute?: BooleanOrPredicate<OnExecuteEventPayload<any>>;
      /**
       * Enable/disable subgraph execute spans (default: true).
       */
      subgraphExecute?: BooleanOrPredicate<OnSubgraphExecutePayload<any>>;
      /**
       * Enable/disable upstream HTTP fetch calls spans (default: true).
       */
      upstreamFetch?: BooleanOrPredicate<OnFetchHookPayload<any>>;
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

export function useOpenTelemetry(
  options: OpenTelemetryGatewayPluginOptions & { logger: Logger },
): GatewayPlugin<OpenTelemetryContextExtension> {
  const inheritContext = options.inheritContext ?? true;
  const propagateContext = options.propagateContext ?? true;
  const useContextManager = options.contextManager !== false;

  let tracer: Tracer;

  let spanProcessors: SpanProcessor[];
  let provider: WebTracerProvider;

  let preparation$: Promise<void> | undefined | void;
  const { promise: asyncAttributes, resolve: resolveAsyncAttributes } =
    createDeferred<{ [ATTR_SERVICE_VERSION]: string }>();

  function isParentEnabled(state: State): boolean {
    const { forRequest, forOperation, forSubgraphExecution } = state;
    const parentState = forSubgraphExecution ?? forOperation ?? forRequest;
    return !parentState || !!parentState.otel;
  }

  function getContext(state?: State): Context {
    if (useContextManager) {
      return context.active();
    }

    if (!state) {
      return ROOT_CONTEXT;
    }

    const { forRequest, forOperation, forSubgraphExecution } = state;
    const currentState = forSubgraphExecution ?? forOperation ?? forRequest;
    return currentState?.otel?.current ?? ROOT_CONTEXT;
  }

  const pluginLogger = options.logger.child('OpenTelemetry');
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

  if (
    !('initializeNodeSDK' in options && options.initializeNodeSDK === false)
  ) {
    const exporters$ = containsOnlyValues(options.exporters)
      ? options.exporters
      : Promise.all(options.exporters);

    const resource = new Resource(
      { [SEMRESATTRS_SERVICE_NAME]: options.serviceName || 'Gateway' },
      asyncAttributes,
    );

    const contextManager$ =
      options.contextManager != undefined
        ? options.contextManager
        : import('@opentelemetry/context-async-hooks').then(
            (module) => new module.AsyncLocalStorageContextManager(),
          );

    preparation$ = mapMaybePromise(exporters$, (exporters) => {
      spanProcessors = exporters;
      provider = new WebTracerProvider({ resource, spanProcessors });
      return mapMaybePromise(contextManager$, (contextManager) => {
        provider.register({
          contextManager: contextManager === false ? undefined : contextManager,
        });
        tracer = options.tracer || trace.getTracer('gateway');
        preparation$ = undefined;
      });
    });
  } else {
    tracer = options.tracer || trace.getTracer('gateway');
  }

  return withState<
    GatewayPlugin<OpenTelemetryContextExtension>,
    OtelState,
    OtelState,
    OtelState
  >({
    onYogaInit({ yoga }) {
      resolveAsyncAttributes({ [ATTR_SERVICE_VERSION]: yoga.version });
    },
    onRequest(onRequestPayload) {
      if (!shouldTrace(options.spans?.http, onRequestPayload)) {
        return;
      }

      return mapMaybePromise(
        preparation$,
        () => {
          const { requestHandler, request, setRequestHandler, state } =
            onRequestPayload;

          const { ctx } = createHttpSpan({
            ctx: inheritContext
              ? propagation.extract(
                  context.active(),
                  request.headers,
                  HeadersTextMapGetter,
                )
              : context.active(),
            request,
            tracer,
            url: onRequestPayload.url,
          });

          if (useContextManager) {
            setRequestHandler(context.bind(ctx, requestHandler));
          }

          state.forRequest.otel = new OtelContextStack(ctx);
        },
        (error) => {
          pluginLogger.error('Failed to start http span', { error });
        },
      );
    },
    onResponse({ response, state }) {
      try {
        state.forRequest.otel &&
          endHttpSpan(state.forRequest.otel.root, response);
      } catch (error) {
        pluginLogger.error('Failed to end http span', { error });
      }
    },
    onEnveloped(onEnvelopedPayload) {
      const { extendContext, context: gqlCtx, state } = onEnvelopedPayload;
      const { forOperation, ...parentState } = state;
      if (!isParentEnabled(parentState)) {
        return;
      }

      if (shouldTrace(options.spans?.graphql, onEnvelopedPayload)) {
        const { ctx } = startGraphQLSpan({
          tracer,
          gqlContext: gqlCtx,
          ctx: getContext(parentState),
        });

        forOperation.otel = new OtelContextStack(ctx);
      }

      extendContext({
        opentelemetry: {
          tracer,
          activeContext: (): Context => getContext(state),
        },
      });
    },
    onParse(onParsePayload) {
      const { state } = onParsePayload;
      if (!isParentEnabled(state)) {
        return;
      }

      if (shouldTrace(options.spans?.graphqlParse, onParsePayload)) {
        const { context: gqlCtx, setParseFn, parseFn } = onParsePayload;
        const { ctx, done } = startGraphQLParseSpan({
          ctx: getContext(state),
          tracer,
          operationName: gqlCtx.params.operationName,
          query: gqlCtx.params.query?.trim(),
        });
        state.forOperation.otel!.push(ctx);
        if (useContextManager) {
          setParseFn(context.bind(ctx, parseFn));
        }
        return ({ result }) => {
          done(result);
          state.forOperation.otel!.pop();
        };
      }

      return;
    },
    onValidate(onValidatePayload) {
      const { context: gqlCtx, state } = onValidatePayload;
      if (!isParentEnabled(state)) {
        return;
      }

      if (shouldTrace(options.spans?.graphqlValidate, onValidatePayload)) {
        const { setValidationFn, validateFn } = onValidatePayload;
        const { ctx, done } = startGraphQLValidateSpan({
          ctx: getContext(state),
          tracer,
          query: gqlCtx.params.query?.trim(),
          operationName: gqlCtx.params.operationName,
        });
        state.forOperation.otel!.push(ctx);
        if (useContextManager) {
          setValidationFn(context.bind(ctx, validateFn));
        }
        return ({ result }) => {
          done(result);
          state.forOperation.otel!.pop();
        };
      }

      return;
    },
    onExecute(onExecuteArgs) {
      const { state } = onExecuteArgs;

      if (!isParentEnabled(state)) {
        return;
      }

      if (shouldTrace(options.spans?.graphqlExecute, onExecuteArgs)) {
        const { setExecuteFn, executeFn } = onExecuteArgs;
        const { ctx, done } = startGraphQLExecuteSpan({
          ctx: getContext(state),
          args: onExecuteArgs.args,
          tracer,
        });
        state.forOperation.otel!.push(ctx);
        if (useContextManager) {
          setExecuteFn(context.bind(ctx, executeFn));
        }
        return {
          onExecuteDone(payload) {
            done(payload.result);
            endGraphQLSpan(state.forOperation.otel!.root, payload);
            state.forOperation.otel!.pop();
          },
        };
      }

      return {
        onExecuteDone: (payload) =>
          endGraphQLSpan(state.forOperation.otel!.root, payload),
      };
    },
    onSubgraphExecute(onSubgraphPayload) {
      const { state } = onSubgraphPayload;
      const { forSubgraphExecution, ...parentState } = state;

      if (!isParentEnabled(parentState)) {
        return;
      }

      // Here it is possible that otelCtx is not present, because this hook can be triggered by
      // internal introspection queries, which are not linked to any client request, but should
      // still be traced and monitored.

      if (shouldTrace(options.spans?.subgraphExecute, onSubgraphPayload)) {
        const { subgraphName, executionRequest, executor, setExecutor } =
          onSubgraphPayload;
        const { ctx, done } = startSubgraphExecuteFetchSpan({
          ctx: getContext(state),
          tracer,
          executionRequest,
          subgraphName,
        });
        forSubgraphExecution.otel = new OtelContextStack(
          getContext(parentState),
        );
        if (useContextManager) {
          setExecutor(context.bind(ctx, executor));
        }
        return ({ result }) => {
          done(result);
          forSubgraphExecution.otel!.pop();
        };
      }

      return;
    },
    onFetch(onFetchPayload) {
      const { state } = onFetchPayload;
      if (!isParentEnabled(state)) {
        return;
      }

      // Here it is possible that otelCtx is not present, because this hook can be triggered by
      // internal introspection queries, which are not linked to any client request, but should
      // still be traced and monitored.

      let onDone: OnFetchHookDone | undefined = void 0;

      if (shouldTrace(options.spans?.upstreamFetch, onFetchPayload)) {
        const { setFetchFn, fetchFn, url, options, executionRequest } =
          onFetchPayload;

        const { ctx, done } = startUpstreamHttpFetchSpan({
          ctx: getContext(state),
          tracer,
          url,
          fetchOptions: options,
          executionRequest,
        });
        state.forSubgraphExecution?.otel?.push(ctx);
        if (useContextManager) {
          setFetchFn(context.bind(ctx, fetchFn));
        }
        onDone = ({ response }) => {
          done(response);
          state.forSubgraphExecution?.otel?.pop();
        };
      }

      if (propagateContext) {
        const { setOptions, options } = onFetchPayload;
        const reqHeaders = getHeadersObj(options.headers || {});
        propagation.inject(getContext(state), reqHeaders);
        setOptions({ ...options, headers: reqHeaders });
      }

      return onDone;
    },
    async [DisposableSymbols.asyncDispose]() {
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
