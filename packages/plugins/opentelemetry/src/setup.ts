import { Attributes, Logger } from '@graphql-hive/logger';
import {
  context,
  ContextManager,
  propagation,
  TextMapPropagator,
  trace,
  TracerProvider,
} from '@opentelemetry/api';
import {
  CompositePropagator,
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
import {
  HiveTracingSpanProcessor,
  HiveTracingSpanProcessorOptions,
} from './hive-span-processor';
import { getEnvVar } from './utils';

export * from './attributes';
export * from './log-writer';
export * from './hive-span-processor';
export { getEnvVar };

// @inject-version globalThis.__OTEL_PLUGIN_VERSION__ here

type TracingOptions = {
  traces?:
    | { tracerProvider: TracerProvider }
    | (TracerOptions &
        (
          | {
              // Processors
              processors: SpanProcessor[];
              tracerProvider?: never;
              exporter?: never;
            }
          | {
              // Exporter
              exporter: SpanExporter;
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
  console?: boolean;
  spanLimits?: SpanLimits;
};

type SamplingOptions =
  | {
      sampler: Sampler;
      samplingRate?: never;
    }
  | {
      sampler?: never;
      samplingRate?: number;
    };

type OpentelemetrySetupOptions = TracingOptions &
  SamplingOptions & {
    resource?: Resource | { serviceName: string; serviceVersion: string };
    contextManager: ContextManager | null;
    propagators?: TextMapPropagator[];
    generalLimits?: GeneralLimits;
    log?: Logger;
  };

export function openTelemetrySetup(options: OpentelemetrySetupOptions) {
  const log = options.log?.child('[OpenTelemetry] ');

  if (getEnvVar('OTEL_SDK_DISABLED', false) === 'true') {
    log?.warn(
      'OpenTelemetry integration is disabled because `OTEL_SDK_DISABLED` environment variable is set to `true`',
    );
    return;
  }

  const logAttributes: Attributes = { registrationResults: {} };
  let logMessage = 'OpenTelemetry integration is enabled';

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
            : getEnvVar(
                'OTEL_SERVICE_NAME',
                '@graphql-mesh/plugin-opentelemetry',
              ),
        [ATTR_SERVICE_VERSION]:
          options.resource && 'serviceVersion' in options.resource
            ? options.resource?.serviceVersion
            : getEnvVar(
                'OTEL_SERVICE_VERSION',
                globalThis.__OTEL_PLUGIN_VERSION__,
              ),
        ['hive.gateway.version']: globalThis.__VERSION__,
        ['hive.otel.version']: globalThis.__OTEL_PLUGIN_VERSION__,
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

  log?.info(logAttributes, logMessage);
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
    log?: Logger;
  },
) {
  const log = config.log?.child('[OpenTelemetry] ');
  config.target ??= getEnvVar('HIVE_TARGET', undefined);

  if (!config.target) {
    throw new Error(
      'You must specify the Hive Registry `target`. Either provide `target` option or `HIVE_TARGET` environment variable.',
    );
  }

  const logAttributes: Attributes = { target: config.target };

  if (!config.processor) {
    config.accessToken ??=
      getEnvVar('HIVE_TRACING_ACCESS_TOKEN', undefined) ??
      getEnvVar('HIVE_ACCESS_TOKEN', undefined);

    if (!config.accessToken) {
      throw new Error(
        'You must specify the Hive Registry `accessToken`. Either provide `accessToken` option or `HIVE_ACCESS_TOKEN`/`HIVE_TRACE_ACCESS_TOKEN` environment variable.',
      );
    }

    logAttributes['endpoint'] = config.endpoint;
    logAttributes['batching'] = config.batching;
  }

  openTelemetrySetup({
    contextManager: config.contextManager,
    resource: resourceFromAttributes({
      'hive.target_id': config.target,
    }),
    traces: {
      processors: [
        new HiveTracingSpanProcessor(config as HiveTracingSpanProcessorOptions),
      ],
    },
  });

  log?.info(logAttributes, 'Hive Tracing integration has been enabled');
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
