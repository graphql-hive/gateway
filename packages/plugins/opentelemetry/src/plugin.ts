import {
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
  endHttpSpan,
  startGraphQLExecuteSpan,
  startGraphQLParseSpan,
  startGraphQLValidateSpan,
  startSubgraphExecuteFetchSpan,
  startUpstreamHttpFetchSpan,
} from './spans';
import { mapMaybePromise } from './utils';

type PrimitiveOrEvaluated<TExpectedResult, TInput = never> =
  | TExpectedResult
  | ((input: TInput) => TExpectedResult);

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
      http?: PrimitiveOrEvaluated<boolean, OnRequestEventPayload<any>>;
      /**
       * Enable/disable GraphQL parse spans (default: true).
       */
      graphqlParse?: PrimitiveOrEvaluated<boolean, OnParseEventPayload<any>>;
      /**
       * Enable/disable GraphQL validate spans (default: true).
       */
      graphqlValidate?: PrimitiveOrEvaluated<
        boolean,
        OnValidateEventPayload<any>
      >;
      /**
       * Enable/disable GraphQL execute spans (default: true).
       */
      graphqlExecute?: PrimitiveOrEvaluated<
        boolean,
        OnExecuteEventPayload<any>
      >;
      /**
       * Enable/disable subgraph execute spans (default: true).
       */
      subgraphExecute?: PrimitiveOrEvaluated<
        boolean,
        OnSubgraphExecutePayload<any>
      >;
      /**
       * Enable/disable upstream HTTP fetch calls spans (default: true).
       */
      upstreamFetch?: PrimitiveOrEvaluated<boolean, OnFetchHookPayload<any>>;
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
    Promise.withResolvers<{ [ATTR_SERVICE_VERSION]: string }>();

  const otelContextFor = {
    request: new WeakMap<Request, OtelGraphqlContext>(),
    operation: new WeakMap<any, OtelGraphqlContext>(), // By graphql context
    subgraphExecution: new WeakMap<ExecutionRequest, OtelGraphqlContext>(),
  };
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
      return mapMaybePromise(
        preparation$,
        () => {
          let { requestHandler, request, setRequestHandler } = onRequestPayload;
          const shouldTraceHttp =
            typeof options.spans?.http === 'function'
              ? options.spans.http(onRequestPayload)
              : (options.spans?.http ?? true);

          let rootContext = inheritContext
            ? propagation.extract(
                context.active(),
                request.headers,
                HeadersTextMapGetter,
              )
            : context.active();

          if (shouldTraceHttp) {
            rootContext = createHttpSpan({
              ctx: rootContext,
              request,
              tracer,
              url: onRequestPayload.url,
            }).ctx;
          }

          if (useContextManager) {
            setRequestHandler(context.bind(rootContext, requestHandler));
          }

          otelContextFor.request.set(
            request,
            new OtelGraphqlContext(rootContext),
          );
        },
        (error) => {
          pluginLogger.error('Failed to start http span', { error });
        },
      );
    },
    onResponse({ request, response }) {
      try {
        endHttpSpan(request, response);
      } catch (error) {
        pluginLogger.error('Failed to end http span', { error });
      }
    },
    onEnveloped({ extendContext, context: ctx }) {
      otelContextFor.operation.set(
        ctx,
        new OtelGraphqlContext(getContext(ctx)),
      );
      extendContext({
        opentelemetry: {
          tracer,
          activeContext: (): Context => getContext(ctx),
        },
      });
    },
    onParse(onParsePayload) {
      const otelCtx = otelContextFor.operation.get(onParsePayload.context);
      if (!otelCtx) {
        pluginLogger.warn('No OTEL context found for this operation.');
        return;
      }
      const shouldTracePrase =
        typeof options.spans?.graphqlParse === 'function'
          ? options.spans.graphqlParse(onParsePayload)
          : (options.spans?.graphqlParse ?? true);

      if (shouldTracePrase) {
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
      return void 0;
    },
    onValidate(onValidatePayload) {
      const otelCtx = otelContextFor.operation.get(onValidatePayload.context);
      if (!otelCtx) {
        pluginLogger.warn('No OTEL context found for this operation.');
        return;
      }

      const shouldTraceValidate =
        typeof options.spans?.graphqlValidate === 'function'
          ? options.spans.graphqlValidate(onValidatePayload)
          : (options.spans?.graphqlValidate ?? true);

      if (shouldTraceValidate) {
        const {
          context: gqlCtx,
          setValidationFn,
          validateFn,
        } = onValidatePayload;
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
      return void 0;
    },
    onExecute(onExecuteArgs) {
      const otelCtx = otelContextFor.operation.get(
        onExecuteArgs.args.contextValue,
      );
      if (!otelCtx) {
        pluginLogger.warn('No OTEL context found for this operation.');
        return;
      }
      const shouldTraceExecute =
        typeof options.spans?.graphqlExecute === 'function'
          ? options.spans.graphqlExecute(onExecuteArgs)
          : (options.spans?.graphqlExecute ?? true);

      if (shouldTraceExecute) {
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
          onExecuteDone({ result }) {
            done(result);
            otelCtx.pop();
          },
        };
      }
      return void 0;
    },
    onSubgraphExecute(onSubgraphPayload) {
      const otelCtx = new OtelGraphqlContext(
        getContext(onSubgraphPayload.executionRequest.context),
      );
      otelContextFor.subgraphExecution.set(
        onSubgraphPayload.executionRequest,
        otelCtx,
      );

      // Here it is possible that otelCtx is not present, because this hook can be triggered by
      // internal introspection queries, which are not linked to any client request, but should
      // still be traced and monitored

      const shouldTraceSubgraphExecute =
        typeof options.spans?.subgraphExecute === 'function'
          ? options.spans.subgraphExecute(onSubgraphPayload)
          : (options.spans?.subgraphExecute ?? true);

      if (shouldTraceSubgraphExecute) {
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
      return void 0;
    },
    onFetch(onFetchPayload) {
      const { executionRequest } = onFetchPayload;
      const otelCtx =
        onFetchPayload.executionRequest &&
        otelContextFor.subgraphExecution.get(onFetchPayload.executionRequest);

      // Here it is possible that otelCtx is not present, because this hook can be triggered by
      // internal introspection queries, which are not linked to any client request, but should
      // still be traced and monitored

      const shouldTraceFetch =
        typeof options.spans?.upstreamFetch === 'function'
          ? options.spans.upstreamFetch(onFetchPayload)
          : (options.spans?.upstreamFetch ?? true);

      let onDone: OnFetchHookDone | undefined = void 0;

      const contextDiscriminant = {
        executionRequest,
        request: executionRequest?.context?.request,
      };

      if (shouldTraceFetch) {
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
