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
  config: ZipkinExporterConfig,
  batchingConfig?: BatchingConfig,
): SpanProcessor {
  return resolveBatchingConfig(new ZipkinExporter(config), batchingConfig);
}

export function createOtlpHttpExporter(
  config: OTLPExporterNodeConfigBase,
  batchingConfig?: BatchingConfig,
): SpanProcessor {
  return resolveBatchingConfig(new OtlpHttpExporter(config), batchingConfig);
}

export function createOtlpGrpcExporter(
  config: OTLPGRPCExporterConfigNode,
  batchingConfig?: BatchingConfig,
): SpanProcessor {
  const requireFn = globalThis.require;
  if (!requireFn) {
    throw new Error('OTLP gRPC exporter is not available in the current environment');
  }
  const exporterModulePrefix = `@opentelemetry/exporter-trace-otlp-`;
  const { OTLPTraceExporter: OtlpGrpcExporter }: typeof import('@opentelemetry/exporter-trace-otlp-grpc') = requireFn(`${exporterModulePrefix}grpc`);
  return resolveBatchingConfig(new OtlpGrpcExporter(config), batchingConfig);
}
