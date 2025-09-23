import { Attributes, Logger } from '@graphql-hive/logger';
import {
  context,
  ContextManager,
  diag,
  DiagLogLevel,
  propagation,
  TextMapPropagator,
  trace,
  TracerProvider,
} from '@opentelemetry/api';
import {
  CompositePropagator,
  setGlobalErrorHandler,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { Resource, resourceFromAttributes } from '@opentelemetry/resources';
import {
  AlwaysOnSampler,
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  GeneralLimits,
  ParentBasedSampler,
  SimpleSpanProcessor,
  SpanLimits,
  TraceIdRatioBasedSampler,
  type BufferConfig,
  type Sampler,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { getEnvBool, getEnvStr } from '~internal/env';
import {
  HiveTracingSpanProcessor,
  HiveTracingSpanProcessorOptions,
} from './hive-span-processor';
import { diagLogLevelFromEnv } from './utils';

export * from './attributes';
export * from './log-writer';
export * from './hive-span-processor';

globalThis.__OTEL_PLUGIN_VERSION__ = 'dev';

type TracingOptions = {
  traces?:
    | {
        /**
         * A custom Trace Provider.
         */
        tracerProvider: TracerProvider;
      }
    | (TracerOptions &
        (
          | {
              // Processors
              /**
               * The span processors that will be used to process recorded spans.
               * All processors will receive all recorded spans.
               */
              processors: SpanProcessor[];
              tracerProvider?: never;
              exporter?: never;
            }
          | {
              // Exporter
              /**
               * The exporter that will be used to send spans.
               */
              exporter: SpanExporter;
              /**
               * The batching options. By default, spans are batched using default BatchProcessor.
               * You can pass `false` to entirely disable batching (not recommended for production).
               */
              batching?: BatchingConfig | boolean;
              tracerProvider?: never;
              processors?: never;
            }
          | {
              // Console only
              tracerProvider?: never;
              processors?: never;
              exporter?: never;
            }
        ));
};

type TracerOptions = {
  /**
   * If true, adds a Console Exporter that will write to stdout all spans.
   * This can be used for debug purposes if you struggle to receive spans.
   */
  console?: boolean;
  /**
   * The limits of the Span API like spans and attribute sizes
   */
  spanLimits?: SpanLimits;
};

type SamplingOptions =
  | {
      /**
       * A custom sampling strategy
       */
      sampler: Sampler;
      samplingRate?: never;
    }
  | {
      sampler?: never;
      /**
       * A sampler rate based on Parent First and Trace Id consistent probabilistic strategy.
       * Set to 1 to record all traces, 0 to record none.
       */
      samplingRate?: number;
    };

export type OpentelemetrySetupOptions = TracingOptions &
  SamplingOptions & {
    /**
     * The Resource that will be used to create the Trace Provider.
     * Can be either a Resource instance, or an simple object with service name and version
     */
    resource?: Resource | { serviceName: string; serviceVersion: string };
    /**
     * The Context Manager to be used to track OTEL Context.
     * If possible, use `AsyncLocalStorageContextManager` from `@opentelemetry/context-async-hooks`.
     */
    contextManager: ContextManager | null;
    /**
     * A custom list of propagators that will replace the default ones (Trace Context and Baggage)
     */
    propagators?: TextMapPropagator[];
    /**
     * The general limits of OTEL attributes.
     */
    generalLimits?: GeneralLimits;
    /**
     * The Logger to be used by this utility.
     * A child of this logger will be used for OTEL diag API, unless `configureDiagLogger` is false
     */
    log?: Logger;
    /**
     * Configure Opentelemetry `diag` API to use Gateway's logger.
     *
     * @default true
     *
     * Note: Logger configuration respects OTEL environment variables standard.
     *       This means that the logger will be enabled only if `OTEL_LOG_LEVEL` variable is set.
     */
    configureDiagLogger?: boolean;
  };

export function openTelemetrySetup(options: OpentelemetrySetupOptions) {
  const log = options.log || new Logger();

  if (getEnvBool('OTEL_SDK_DISABLED')) {
    log.warn(
      'OpenTelemetry integration is disabled because `OTEL_SDK_DISABLED` environment variable is truthy',
    );
    return;
  }

  const logAttributes: Attributes = { registrationResults: {} };
  let logMessage = 'OpenTelemetry integration is enabled';

  if (options.configureDiagLogger !== false) {
    // If the log level is not explicitly set, we use VERBOSE to let Hive Logger log level feature filter logs accordingly.
    const [diagLogLevel, hiveLogLevel] = diagLogLevelFromEnv() ?? [
      DiagLogLevel.VERBOSE,
      null,
    ];
    const diagLog = log.child('[diag] ') as Logger & {
      verbose: Logger['trace'];
    };
    diagLog.verbose = diagLog.trace;
    // If the log level as been specified via `OTEL_LOG_LEVEL` env, we set the Hive Log level accordingly
    if (hiveLogLevel) {
      diagLog.setLevel(hiveLogLevel);
    }
    diag.setLogger(diagLog, diagLogLevel);
    // Fix the default error handler that JSON.stringify all errors, even if it's already a string.
    setGlobalErrorHandler((err) => diagLog.error(err as Attributes));
  }

  if (options.traces) {
    if (options.traces.tracerProvider) {
      if (
        'register' in options.traces.tracerProvider &&
        typeof options.traces.tracerProvider.register === 'function'
      ) {
        logAttributes['registrationResults'].tracer =
          options.traces.tracerProvider.register();
      } else {
        logAttributes['registrationResults'].tracer =
          trace.setGlobalTracerProvider(options.traces.tracerProvider);
      }
      logMessage += ' and provided TracerProvider has been registered';
    } else {
      let spanProcessors = options.traces.processors ?? [];

      if (options.traces.exporter) {
        spanProcessors.push(
          resolveBatchingConfig(
            options.traces.exporter,
            options.traces.batching,
          ),
        );
        logMessage += ' and exporter have been registered';
        logAttributes['batching'] = options.traces.batching ?? true;
      }

      if (options.traces.console) {
        spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
        logMessage += ' in addition to an stdout debug exporter';
        logAttributes['console'] = true;
      }

      const baseResource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]:
          options.resource && 'serviceName' in options.resource
            ? options.resource?.serviceName
            : getEnvStr('OTEL_SERVICE_NAME') ||
              '@graphql-hive/plugin-opentelemetry',
        [ATTR_SERVICE_VERSION]:
          options.resource && 'serviceVersion' in options.resource
            ? options.resource?.serviceVersion
            : getEnvStr('OTEL_SERVICE_VERSION') ||
              globalThis.__OTEL_PLUGIN_VERSION__ ||
              'unknown',
        ['hive.gateway.version']: globalThis.__VERSION__,
        ['hive.otel.version']: globalThis.__OTEL_PLUGIN_VERSION__ || 'unknown',
      });

      const resource =
        options.resource && !('serviceName' in options.resource)
          ? baseResource.merge(options.resource)
          : baseResource;

      logAttributes['resource'] = resource.attributes;
      logAttributes['sampling'] = options.sampler
        ? 'custom'
        : options.samplingRate;

      logAttributes['registrationResults'].tracerProvider =
        trace.setGlobalTracerProvider(
          new BasicTracerProvider({
            resource,
            sampler:
              options.sampler ??
              (options.samplingRate
                ? new ParentBasedSampler({
                    root: new TraceIdRatioBasedSampler(options.samplingRate),
                  })
                : new AlwaysOnSampler()),
            spanProcessors,
            generalLimits: options.generalLimits,
            spanLimits: options.traces.spanLimits,
          }),
        );
    }
  }

  if (options.contextManager !== null) {
    logAttributes['registrationResults'].contextManager =
      context.setGlobalContextManager(options.contextManager);
  }

  if (!options.propagators || options.propagators.length !== 0) {
    const propagators = options.propagators ?? [
      new W3CBaggagePropagator(),
      new W3CTraceContextPropagator(),
    ];

    logAttributes['registrationResults'].propagators =
      propagation.setGlobalPropagator(
        propagators.length === 1
          ? propagators[0]!
          : new CompositePropagator({ propagators }),
      );
  }

  log.info(logAttributes, logMessage);
}

export type HiveTracingOptions = { target?: string } & (
  | {
      accessToken?: string;
      batching?: BufferConfig;
      processor?: never;
      endpoint?: string;
    }
  | {
      processor: SpanProcessor;
    }
);

export function hiveTracingSetup(
  config: HiveTracingOptions & {
    contextManager: ContextManager | null;
    /**
     * The Resource that will be used to create the Trace Provider.
     * Can be either a Resource instance, or an simple object with service name and version
     */
    resource?: Resource | { serviceName: string; serviceVersion: string };
    log?: Logger;
  },
) {
  const log = config.log || new Logger();
  config.target ??= getEnvStr('HIVE_TARGET');

  if (!config.target) {
    throw new Error(
      'You must specify the Hive Registry `target`. Either provide `target` option or `HIVE_TARGET` environment variable.',
    );
  }

  const logAttributes: Attributes = { target: config.target };

  if (!config.processor) {
    config.accessToken ??=
      getEnvStr('HIVE_TRACING_ACCESS_TOKEN') ?? getEnvStr('HIVE_ACCESS_TOKEN');

    if (!config.accessToken) {
      throw new Error(
        'You must specify the Hive Registry `accessToken`. Either provide `accessToken` option or `HIVE_ACCESS_TOKEN`/`HIVE_TRACE_ACCESS_TOKEN` environment variable.',
      );
    }

    logAttributes['endpoint'] = config.endpoint;
    logAttributes['batching'] = config.batching;
  }

  let resource = resourceFromAttributes({
    'hive.target_id': config.target,
  });

  if (config.resource) {
    if ('serviceName' in config.resource) {
      resource = resource.merge(
        resourceFromAttributes({
          [ATTR_SERVICE_NAME]: config.resource.serviceName,
          [ATTR_SERVICE_VERSION]: config.resource.serviceVersion,
        }),
      );
    } else {
      resource = resource.merge(config.resource);
    }
  }

  openTelemetrySetup({
    log,
    contextManager: config.contextManager,
    resource,
    traces: {
      processors: [
        new HiveTracingSpanProcessor(config as HiveTracingSpanProcessorOptions),
      ],
    },
  });

  log.info(logAttributes, 'Hive Tracing integration has been enabled');
}

export type BatchingConfig = boolean | BufferConfig;

function resolveBatchingConfig(
  exporter: SpanExporter,
  batchingConfig?: BatchingConfig,
): SpanProcessor {
  const value = batchingConfig ?? true;

  if (value === true) {
    return new BatchSpanProcessor(exporter);
  } else if (value === false) {
    return new SimpleSpanProcessor(exporter);
  } else {
    return new BatchSpanProcessor(exporter, value);
  }
}
