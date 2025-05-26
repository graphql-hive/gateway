import { type ContextManager } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  AlwaysOnSampler,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';

// We don't want to bundle node only deps in non-node compatible envs
const doNotBundleThisModule = '@opentelemetry';

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

tracerProvider.register({
  contextManager: await getContextManager(),
});

export function getContextManager(): Promise<ContextManager | undefined> {
  return import(`${doNotBundleThisModule}/context-async-hooks`)
    .then((module) => new module.AsyncLocalStorageContextManager())
    .catch(() => undefined);
}

export { tracerProvider, resource };
