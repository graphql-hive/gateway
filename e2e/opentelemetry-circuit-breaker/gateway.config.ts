import { defineConfig } from '@graphql-hive/gateway';
import { hiveTracingSetup } from '@graphql-hive/plugin-opentelemetry/setup';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

hiveTracingSetup({
  contextManager: new AsyncLocalStorageContextManager(),
  target: 'some/tar/get',
  accessToken: 'heysupersecret',
  endpoint: process.env['HIVE_TRACING_ENDPOINT']!,
});

export const gatewayConfig = defineConfig({
  openTelemetry: {
    traces: true,
  },
});
