import {
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_SERVICE_NAME,
} from '@graphql-mesh/plugin-opentelemetry';
import { diag } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { setGlobalErrorHandler } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  AlwaysOnSampler,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import { version } from './package.json' with { type: 'json' };

setGlobalErrorHandler((err) => diag.error('Uncaught Error', err));

const { OTLPTraceExporter } =
  process.env['OTLP_EXPORTER_TYPE'] === 'http'
    ? await import(`@opentelemetry/exporter-trace-otlp-http`)
    : await import(`@opentelemetry/exporter-trace-otlp-grpc`);

// AsyncLocalStorage is not always available
const tracerProvider = new WebTracerProvider({
  resource: resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: process.env['OTLP_SERVICE_NAME'],
    [ATTR_SERVICE_VERSION]: version,
  }),
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: process.env['OTLP_EXPORTER_URL'],
      }),
      // Batching config is set in order to make it easier to test.
      {
        maxExportBatchSize: 1,
        scheduledDelayMillis: 1,
      },
    ),
  ],
  sampler: new AlwaysOnSampler(),
});

tracerProvider.register({
  contextManager: new AsyncLocalStorageContextManager(),
});

export { tracerProvider };
