import { ContextManager, diag } from '@opentelemetry/api';
import { setGlobalErrorHandler } from '@opentelemetry/core';
import { OTLPTraceExporter as OtlpHttpExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  ZipkinExporter,
  type ExporterConfig as ZipkinExporterConfig,
} from '@opentelemetry/exporter-zipkin';
import { type OTLPExporterNodeConfigBase } from '@opentelemetry/otlp-exporter-base';
import { type OTLPGRPCExporterConfigNode } from '@opentelemetry/otlp-grpc-exporter-base';
import { Resource, resourceFromAttributes } from '@opentelemetry/resources';
import {
  type BufferConfig,
  type Sampler,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  AlwaysOnSampler,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import {
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';
import { getEnvVar } from './utils';

// @inject-version globalThis.__OTEL_PLUGIN_VERSION__ here

type TracingOptions = {
  traces:
    | {
        processors: SpanProcessor[];
        exporters?: never;
      }
    | {
        processors?: never;
        exporter: SpanExporter;
        batching?: BatchingConfig | boolean;
        console?: boolean;
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
  };

export function opentelemetrySetup(options: OpentelemetrySetupOptions) {
  setGlobalErrorHandler((err) => {
    diag.error('Uncaught Error', err);
  });

  let spanProcessors = options.traces.processors;
  if (!options.traces.processors) {
    spanProcessors = [
      resolveBatchingConfig(options.traces.exporter, options.traces.batching),
    ];

    if (options.traces.console) {
      spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    }
  }

  const provider = new WebTracerProvider({
    resource:
      options.resource && !('serviceName' in options.resource)
        ? options.resource
        : resourceFromAttributes({
            [SEMRESATTRS_SERVICE_NAME]:
              options.resource?.serviceName ??
              getEnvVar(
                'OTEL_SERVICE_NAME',
                '@graphql-mesh/plugin-opentelemetry',
              ),
            [ATTR_SERVICE_VERSION]:
              options.resource?.serviceVersion ??
              getEnvVar(
                'OTEL_SERVICE_VERSION',
                globalThis.__OTEL_PLUGIN_VERSION__,
              ),
          }),
    sampler:
      options.sampler ??
      (options.samplingRate
        ? new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(options.samplingRate),
          })
        : new AlwaysOnSampler()),
    spanProcessors,
  });

  provider.register({
    contextManager: options.contextManager || undefined,
  });

  return provider;
}

export async function getContextManager(
  contextManager?: boolean | ContextManager,
): Promise<ContextManager | undefined> {
  if (contextManager === false) {
    return undefined;
  }

  if (contextManager === true || contextManager == undefined) {
    try {
      const doNotBundleThisModule = '@graphql-hive/plugin-opentelemetry';
      const { AsyncLocalStorageContextManager } = await import(
        `${doNotBundleThisModule}/async-context-manager`
      );
      return new AsyncLocalStorageContextManager();
    } catch (err) {
      // If `async_hooks` is not available, we want to error only if the context manager is
      // explicitly enabled.
      if (contextManager === true) {
        throw new Error(
          "[OTEL] 'node:async_hooks' module is not available: can't initialize context manager. Possible solutions:\n" +
            '\t- disable context manager usage by providing `contextManager: false`\n' +
            '\t- provide a custom context manager in the `contextManager` option' +
            'Learn more about OTEL configuration here: https://the-guild.dev/graphql/hive/docs/gateway/monitoring-tracing#opentelemetry-traces',
          { cause: err },
        );
      }
    }
  }

  return undefined;
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

export function createStdoutExporter(
  batchingConfig?: BatchingConfig,
): SpanProcessor {
  return resolveBatchingConfig(new ConsoleSpanExporter(), batchingConfig);
}

export function createZipkinExporter(
  config?: ZipkinExporterConfig,
  batchingConfig?: BatchingConfig,
): SpanProcessor {
  return resolveBatchingConfig(new ZipkinExporter(config), batchingConfig);
}

export function createOtlpHttpExporter(
  config?: OTLPExporterNodeConfigBase,
  batchingConfig?: BatchingConfig,
): SpanProcessor {
  return resolveBatchingConfig(new OtlpHttpExporter(config), batchingConfig);
}

interface SpanExporterCtor<TConfig = unknown> {
  new (config: TConfig): SpanExporter;
}

function loadExporterLazily<
  TConfig,
  TSpanExporterCtor extends SpanExporterCtor<TConfig>,
>(
  exporterName: string,
  exporterModuleName: string,
  exportNameInModule: string,
): MaybePromise<TSpanExporterCtor> {
  try {
    return handleMaybePromise(
      () => import(exporterModuleName),
      (mod) => {
        const ExportCtor =
          mod?.default?.[exportNameInModule] || mod?.[exportNameInModule];
        if (!ExportCtor) {
          throw new Error(
            `${exporterName} exporter is not available in the current environment`,
          );
        }
        return ExportCtor;
      },
    );
  } catch (err) {
    throw new Error(
      `${exporterName} exporter is not available in the current environment`,
    );
  }
}

export function createOtlpGrpcExporter(
  config?: OTLPGRPCExporterConfigNode,
  batchingConfig?: BatchingConfig,
): MaybePromise<SpanProcessor> {
  return handleMaybePromise(
    () =>
      loadExporterLazily(
        'OTLP gRPC',
        '@opentelemetry/exporter-trace-otlp-grpc',
        'OTLPTraceExporter',
      ),
    (OTLPTraceExporter) => {
      return resolveBatchingConfig(
        new OTLPTraceExporter(config),
        batchingConfig,
      );
    },
  );
}
