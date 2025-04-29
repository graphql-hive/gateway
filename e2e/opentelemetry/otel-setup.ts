import {
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_SERVICE_NAME,
} from '@graphql-mesh/plugin-opentelemetry';
import { type ContextManager } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  AlwaysOnSampler,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import { version } from './package.json' with { type: 'json' };

// We don't want to bundle node only deps in non-node compatible envs
const doNotBundleThisModule = '@opentelemetry';

const { OTLPTraceExporter } =
  process.env['OTLP_EXPORTER_TYPE'] === 'http'
    ? await import(`${doNotBundleThisModule}/exporter-trace-otlp-http`)
    : await import(`${doNotBundleThisModule}/exporter-trace-otlp-grpc`);

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
  contextManager: await getContextManager(),
});

export function getContextManager(): Promise<ContextManager | undefined> {
  return import(`${doNotBundleThisModule}/context-async-hooks`)
    .then((module) => new module.AsyncLocalStorageContextManager())
    .catch(() => undefined);
}

export { tracerProvider };
