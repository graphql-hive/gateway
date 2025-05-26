import { diag } from '@opentelemetry/api';
import { setGlobalErrorHandler } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  AlwaysOnSampler,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';

setGlobalErrorHandler((err) => diag.error('Uncaught Error', err));

const resource = resourceFromAttributes({});

const tracerProvider = new WebTracerProvider({
  resource,
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

tracerProvider.register();

export { tracerProvider, resource };
