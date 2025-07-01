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
  ParentBasedSampler,
  SimpleSpanProcessor,
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
import { getEnvVar } from './utils';

export * from './attributes';

// @inject-version globalThis.__OTEL_PLUGIN_VERSION__ here

type TracingOptions = {
  traces?:
    | { tracerProvider: TracerProvider; processors?: never; exporter?: never }
    | {
        tracerProvider?: never;
        processors: SpanProcessor[];
        exporter?: never;
      }
    | {
        tracerProvider?: never;
        processors?: never;
        exporter: SpanExporter;
        batching?: BatchingConfig | boolean;
        console?: boolean;
      }
    | {
        tracerProvider?: never;
        processors?: never;
        exporter?: never;
        batching?: never;
        console: boolean;
      };
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
    contextManager: ContextManager | false;
    propagators?: TextMapPropagator[] | false;
  };

export function opentelemetrySetup(options: OpentelemetrySetupOptions) {
  if (getEnvVar('OTEL_SDK_DISABLED', false) === 'true') {
    return;
  }

  if (options.traces) {
    if (options.traces.tracerProvider) {
      trace.setGlobalTracerProvider(options.traces.tracerProvider);
    } else {
      let spanProcessors = options.traces.processors;
      if (!options.traces.processors) {
        spanProcessors = [];

        if (options.traces.exporter) {
          spanProcessors.push(
            resolveBatchingConfig(
              options.traces.exporter,
              options.traces.batching,
            ),
          );
        }

        if (options.traces.console) {
          spanProcessors.push(
            new SimpleSpanProcessor(new ConsoleSpanExporter()),
          );
        }
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
      });

      trace.setGlobalTracerProvider(
        new BasicTracerProvider({
          resource:
            options.resource && !('serviceName' in options.resource)
              ? baseResource.merge(options.resource)
              : baseResource,
          sampler:
            options.sampler ??
            (options.samplingRate
              ? new ParentBasedSampler({
                  root: new TraceIdRatioBasedSampler(options.samplingRate),
                })
              : new AlwaysOnSampler()),
          spanProcessors,
        }),
      );
    }

    if (options.contextManager !== false) {
      context.setGlobalContextManager(options.contextManager);
    }

    if (options.propagators !== false) {
      const propagators = options.propagators ?? [
        new W3CBaggagePropagator(),
        new W3CTraceContextPropagator(),
      ];

      propagation.setGlobalPropagator(
        propagators.length === 1
          ? propagators[0]!
          : new CompositePropagator({ propagators }),
      );
    }
  }
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
