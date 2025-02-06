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
import {
  createDeferred,
  isPromise,
  MaybePromise,
  type ExecutionRequest,
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
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { type OnRequestEventPayload } from '@whatwg-node/server';
import { ATTR_SERVICE_VERSION, SEMRESATTRS_SERVICE_NAME } from './attributes';
import { OtelGraphqlContext } from './contextManager';
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

  const otelContextFor = {
    request: new WeakMap<Request, OtelGraphqlContext>(),
    operation: new WeakMap<any, OtelGraphqlContext>(), // By graphql context
    subgraphExecution: new WeakMap<ExecutionRequest, OtelGraphqlContext>(),
  };

  function isParentEnabled(input: {
    gqlCtx?: unknown;
    request?: Request;
    executionRequest?: any;
  }): boolean {
    const { request, gqlCtx, executionRequest: exr } = input;
    if (request && !otelContextFor.request.has(request)) return false;
    if (gqlCtx && !otelContextFor.operation.has(gqlCtx)) return false;
    if (exr && !otelContextFor.subgraphExecution.has(exr)) return false;
    return true;
  }

  function getContext(
    ctx?: {
      request: Request;
      executionRequest?: any;
    } | null,
  ): Context {
    if (useContextManager) {
      return context.active();
    }
    if (!ctx) {
      return ROOT_CONTEXT;
    }

    if (ctx.executionRequest) {
      const ctxForSubgraph = otelContextFor.subgraphExecution.get(
        ctx.executionRequest,
      );
      if (ctxForSubgraph) {
        return ctxForSubgraph.current;
      }
    }

    const ctxForOperation = otelContextFor.operation.get(ctx);
    if (ctxForOperation) {
      return ctxForOperation.current;
    }

    const ctxForRequest = otelContextFor.request.get(ctx.request);
    if (ctxForRequest) {
      return ctxForRequest.current;
    }

    return ROOT_CONTEXT;
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

  return {
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
          let { requestHandler, request, setRequestHandler } = onRequestPayload;

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

          otelContextFor.request.set(request, new OtelGraphqlContext(ctx));
        },
        (error) => {
          pluginLogger.error('Failed to start http span', { error });
        },
      );
    },
    onResponse({ request, response }) {
      try {
        const ctx = otelContextFor.request.get(request);
        ctx && endHttpSpan(ctx.root, response);
      } catch (error) {
        pluginLogger.error('Failed to end http span', { error });
      }
    },
    onEnveloped(onEnvelopedPayload) {
      const { extendContext, context: gqlCtx } = onEnvelopedPayload;
      if (!isParentEnabled({ request: gqlCtx?.request })) {
        return;
      }


      if (shouldTrace(options.spans?.graphql, onEnvelopedPayload)) {
        const { ctx } = startGraphQLSpan({
          tracer,
          gqlContext: gqlCtx,
          ctx: getContext(gqlCtx),
        });

        otelContextFor.operation.set(gqlCtx, new OtelGraphqlContext(ctx));
      }

      extendContext({
        opentelemetry: {
          tracer,
          activeContext: (): Context => getContext(gqlCtx),
        },
      });
    },
    onParse(onParsePayload) {
      const { context: gqlCtx } = onParsePayload;

      if (!isParentEnabled({ request: gqlCtx.request, gqlCtx })) {
        return;
      }


      if (shouldTrace(options.spans?.graphqlParse, onParsePayload)) {
        const otelCtx = otelContextFor.operation.get(onParsePayload.context)!;
        const { context: gqlCtx, setParseFn, parseFn } = onParsePayload;
        const { ctx, done } = startGraphQLParseSpan({
          ctx: getContext(onParsePayload.context),
          tracer,
          operationName: gqlCtx.params.operationName,
          query: gqlCtx.params.query?.trim(),
        });
        otelCtx.push(ctx);
        if (useContextManager) {
          setParseFn(context.bind(ctx, parseFn));
        }
        return ({ result }) => {
          done(result);
          otelCtx.pop();
        };
      }

      return;
    },
    onValidate(onValidatePayload) {
      const { context: gqlCtx } = onValidatePayload;

      if (!isParentEnabled({ request: gqlCtx.request, gqlCtx })) {
        return;
      }


      if (shouldTrace(options.spans?.graphqlValidate, onValidatePayload)) {
        const otelCtx = otelContextFor.operation.get(gqlCtx)!;
        const { setValidationFn, validateFn } = onValidatePayload;
        const { ctx, done } = startGraphQLValidateSpan({
          ctx: getContext(onValidatePayload.context),
          tracer,
          query: gqlCtx.params.query?.trim(),
          operationName: gqlCtx.params.operationName,
        });
        otelCtx?.push(ctx);
        if (useContextManager) {
          setValidationFn(context.bind(ctx, validateFn));
        }
        return ({ result }) => {
          done(result);
          otelCtx.pop();
        };
      }

      return;
    },
    onExecute(onExecuteArgs) {
      const gqlCtx = onExecuteArgs.args.contextValue;

      if (!isParentEnabled({ request: gqlCtx.request, gqlCtx })) {
        return;
      }

      const otelCtx = otelContextFor.operation.get(gqlCtx)!;

      if (shouldTrace(options.spans?.graphqlExecute, onExecuteArgs)) {
        const { setExecuteFn, executeFn } = onExecuteArgs;
        const { ctx, done } = startGraphQLExecuteSpan({
          ctx: getContext(onExecuteArgs.args.contextValue),
          args: onExecuteArgs.args,
          tracer,
        });
        otelCtx.push(ctx);
        if (useContextManager) {
          setExecuteFn(context.bind(ctx, executeFn));
        }
        return {
          onExecuteDone(payload) {
            done(payload.result);
            endGraphQLSpan(otelCtx.root, payload);
            otelCtx.pop();
          },
        };
      }

      return {
        onExecuteDone: (payload) => endGraphQLSpan(otelCtx.root, payload),
      };
    },
    onSubgraphExecute(onSubgraphPayload) {
      const { context: gqlCtx } = onSubgraphPayload.executionRequest;

      if (!isParentEnabled({ request: gqlCtx?.request, gqlCtx })) {
        return;
      }

      // Here it is possible that otelCtx is not present, because this hook can be triggered by
      // internal introspection queries, which are not linked to any client request, but should
      // still be traced and monitored.
      const otelCtx = new OtelGraphqlContext(
        getContext(onSubgraphPayload.executionRequest.context),
      );

      otelContextFor.subgraphExecution.set(
        onSubgraphPayload.executionRequest,
        otelCtx,
      );

      if (shouldTrace(options.spans?.subgraphExecute, onSubgraphPayload)) {
        const { subgraphName, executionRequest, executor, setExecutor } =
          onSubgraphPayload;
        const { ctx, done } = startSubgraphExecuteFetchSpan({
          ctx: getContext(onSubgraphPayload.executionRequest.context),
          tracer,
          executionRequest,
          subgraphName,
        });
        otelCtx?.push(ctx);
        if (useContextManager) {
          setExecutor(context.bind(ctx, executor));
        }
        return ({ result }) => {
          done(result);
          otelCtx?.pop();
        };
      }

      return;
    },
    onFetch(onFetchPayload) {
      const { executionRequest } = onFetchPayload;
      const gqlCtx = executionRequest?.context;
      if (
        !isParentEnabled({ executionRequest, request: gqlCtx.request, gqlCtx })
      ) {
        return;
      }

      // Here it is possible that otelCtx is not present, because this hook can be triggered by
      // internal introspection queries, which are not linked to any client request, but should
      // still be traced and monitored.
      const otelCtx =
        onFetchPayload.executionRequest &&
        otelContextFor.subgraphExecution.get(onFetchPayload.executionRequest);

      let onDone: OnFetchHookDone | undefined = void 0;

      const contextDiscriminant = {
        executionRequest,
        request: executionRequest?.context?.request,
      };

      if (shouldTrace(options.spans?.upstreamFetch, onFetchPayload)) {
        const { setFetchFn, fetchFn, url, options } = onFetchPayload;

        const { ctx, done } = startUpstreamHttpFetchSpan({
          ctx: getContext(contextDiscriminant),
          tracer,
          url,
          fetchOptions: options,
          executionRequest,
        });
        otelCtx?.push(ctx);
        if (useContextManager) {
          setFetchFn(context.bind(ctx, fetchFn));
        }
        onDone = ({ response }) => {
          done(response);
          otelCtx?.pop();
        };
      }

      if (propagateContext) {
        const { setOptions, options } = onFetchPayload;
        const reqHeaders = getHeadersObj(options.headers || {});
        propagation.inject(getContext(contextDiscriminant), reqHeaders);
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
  };
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
