import { OTLPTraceExporter as OtlpHttpExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  ZipkinExporter,
  type ExporterConfig as ZipkinExporterConfig,
} from '@opentelemetry/exporter-zipkin';
import { type OTLPExporterNodeConfigBase } from '@opentelemetry/otlp-exporter-base';
import { type OTLPGRPCExporterConfigNode } from '@opentelemetry/otlp-grpc-exporter-base';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type BufferConfig,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';

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
