import {
  type OnExecuteEventPayload,
  type OnParseEventPayload,
  type OnValidateEventPayload,
} from '@envelop/types';
import { type GatewayPlugin } from '@graphql-hive/gateway-runtime';
import type { OnSubgraphExecutePayload } from '@graphql-mesh/fusion-runtime';
import type { Logger, OnFetchHookPayload } from '@graphql-mesh/types';
import { getHeadersObj } from '@graphql-mesh/utils';
import {
  fakePromise,
  isAsyncIterable,
  MaybePromise,
} from '@graphql-tools/utils';
import {
  context,
  diag,
  DiagLogLevel,
  propagation,
  trace,
  type Context,
  type TextMapGetter,
  type Tracer,
} from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { type OnRequestEventPayload } from '@whatwg-node/server';
import { ATTR_SERVICE_VERSION, SEMRESATTRS_SERVICE_NAME } from './attributes';
import {
  completeHttpSpan,
  createSubgraphExecuteFetchSpan,
  startGraphQLExecuteSpan,
  startGraphQLParseSpan,
  startGraphQLValidateSpan,
  startHttpSpan,
  startUpstreamHttpFetchSpan,
} from './spans';

type PrimitiveOrEvaluated<TExpectedResult, TInput = never> =
  | TExpectedResult
  | ((input: TInput) => TExpectedResult);

interface OpenTelemetryGatewayPluginOptionsWithoutInit {
  /**
   * Whether to initialize the OpenTelemetry SDK (default: true).
   */
  initializeNodeSDK: false;
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

export function useOpenTelemetry(
  options: OpenTelemetryGatewayPluginOptions & { logger: Logger },
): GatewayPlugin<{
  opentelemetry: {
    tracer: Tracer;
    activeContext: () => Context;
  };
}> {
  const inheritContext = options.inheritContext ?? true;
  const propagateContext = options.propagateContext ?? true;

  const requestContextMapping = new WeakMap<Request, Context>();
  let tracer: Tracer;

  let spanProcessors: SpanProcessor[];
  let serviceName: string = 'Gateway';
  let provider: WebTracerProvider;

  let preparation$: Promise<void> | undefined;

  return {
    onYogaInit({ yoga }) {
      preparation$ = fakePromise(undefined).then(async () => {
        if (
          !(
            'initializeNodeSDK' in options &&
            options.initializeNodeSDK === false
          )
        ) {
          if (options.serviceName) {
            serviceName = options.serviceName;
          }
          if (options.exporters) {
            spanProcessors = await Promise.all(options.exporters);
          }
          const webProvider = new WebTracerProvider({
            resource: new Resource({
              [SEMRESATTRS_SERVICE_NAME]: serviceName,
              [ATTR_SERVICE_VERSION]: yoga.version,
            }),
            spanProcessors,
          });
          webProvider.register();
          provider = webProvider;
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
        tracer = options.tracer || trace.getTracer('gateway');
        preparation$ = undefined;
      });
    },
    onContextBuilding({ extendContext, context }) {
      extendContext({
        opentelemetry: {
          tracer,
          activeContext: () =>
            requestContextMapping.get(context.request) ?? context['active'](),
        },
      });
    },
    onRequest(onRequestPayload) {
      let { requestHandler, request, setRequestHandler } = onRequestPayload;

      if (inheritContext) {
        const originalRequestHandler = requestHandler;

        requestHandler = (...args) =>
          context.with(
            propagation.extract(
              context.active(),
              request.headers,
              HeadersTextMapGetter,
            ),
            () => originalRequestHandler(...args),
          );
      }

      const shouldTraceHttp =
        typeof options.spans?.http === 'function'
          ? options.spans.http(onRequestPayload)
          : (options.spans?.http ?? true);

      if (shouldTraceHttp) {
        const { url } = onRequestPayload;
        const originalRequestHandler = requestHandler;
        requestHandler = (...args) =>
          startHttpSpan({
            tracer,
            request,
            url,
            callback: () => originalRequestHandler(...args),
          }) as Response | Promise<Response>; // FIXME: MaybePromise is not assignable to T|Promise<T>
      }

      setRequestHandler(requestHandler);
      return preparation$;
    },
    onValidate(onValidatePayload) {
      const shouldTraceValidate =
        typeof options.spans?.graphqlValidate === 'function'
          ? options.spans.graphqlValidate(onValidatePayload)
          : (options.spans?.graphqlValidate ?? true);

      if (shouldTraceValidate) {
        const { context, setValidationFn, validateFn } = onValidatePayload;
        setValidationFn((...args) =>
          startGraphQLValidateSpan({
            tracer,
            query: context.params.query?.trim(),
            operationName: context.params.operationName,
            callback: () => validateFn(...args),
          }),
        );
      }
    },
    onParse(onParsePayload) {
      const shouldTracePrase =
        typeof options.spans?.graphqlParse === 'function'
          ? options.spans.graphqlParse(onParsePayload)
          : (options.spans?.graphqlParse ?? true);

      if (shouldTracePrase) {
        const { context, setParseFn, parseFn } = onParsePayload;
        setParseFn((...args) =>
          startGraphQLParseSpan({
            tracer,
            operationName: context.params.operationName,
            query: context.params.query?.trim(),
            callback: () => parseFn(...args),
          }),
        );
      }
      return void 0;
    },
    onExecute(onExecuteArgs) {
      const shouldTraceExecute =
        typeof options.spans?.graphqlExecute === 'function'
          ? options.spans.graphqlExecute(onExecuteArgs)
          : (options.spans?.graphqlExecute ?? true);

      if (shouldTraceExecute) {
        const { setExecuteFn, executeFn } = onExecuteArgs;
        setExecuteFn((...args) =>
          startGraphQLExecuteSpan({
            args: onExecuteArgs.args,
            tracer,
            callback: () => executeFn(...args),
          }),
        );
      }
    },
    onSubgraphExecute(onSubgraphPayload) {
      const shouldTraceSubgraphExecute =
        typeof options.spans?.subgraphExecute === 'function'
          ? options.spans.subgraphExecute(onSubgraphPayload)
          : (options.spans?.subgraphExecute ?? true);

      if (shouldTraceSubgraphExecute) {
        const { subgraphName, executionRequest, executor, setExecutor } =
          onSubgraphPayload;
        setExecutor((...args) =>
          createSubgraphExecuteFetchSpan({
            tracer,
            executionRequest,
            subgraphName,
            callback: () => executor(...args),
          }),
        );
      }
    },
    onFetch(onFetchPayload) {
      const shouldTraceFetch =
        typeof options.spans?.upstreamFetch === 'function'
          ? options.spans.upstreamFetch(onFetchPayload)
          : (options.spans?.upstreamFetch ?? true);

      if (propagateContext) {
        const { setOptions, options } = onFetchPayload;
        const reqHeaders = getHeadersObj(options.headers || {});
        propagation.inject(context.active(), reqHeaders);
        setOptions({ ...options, headers: reqHeaders });
      }

      if (shouldTraceFetch) {
        const { setFetchFn, fetchFn, executionRequest, url, options } =
          onFetchPayload;

        setFetchFn((...args) =>
          startUpstreamHttpFetchSpan({
            tracer,
            url,
            fetchOptions: options,
            executionRequest,
            callback: () => fetchFn(...args),
          }),
        );
      }
    },
    async [DisposableSymbols.asyncDispose]() {
      if (spanProcessors) {
        await Promise.all(
          spanProcessors.map((processor) => processor.forceFlush()),
        );
      }
      await provider?.forceFlush?.();

      if (spanProcessors) {
        spanProcessors.forEach((processor) => processor.shutdown());
      }

      await provider?.shutdown?.();

      diag.disable();
      trace.disable();
      context.disable();
      propagation.disable();
    },
  };
}
