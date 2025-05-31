import { SEMRESATTRS_SERVICE_NAME } from '@graphql-mesh/plugin-opentelemetry';
import { diag } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { setGlobalErrorHandler } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  AlwaysOnSampler,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';

setGlobalErrorHandler((err) => diag.error('Uncaught Error', err));

const tracerProvider = new WebTracerProvider({
  resource: resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: process.env['OTLP_SERVICE_NAME'],
  }),
  spanProcessors: [
    // Do not batch for test
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: process.env['OTLP_EXPORTER_URL'],
      }),
    ),
  ],
  sampler: new AlwaysOnSampler(),
});

tracerProvider.register({
  contextManager: new AsyncLocalStorageContextManager(),
});

export { tracerProvider };
