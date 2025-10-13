import { defineConfig } from '@graphql-hive/gateway';
import { openTelemetrySetup } from '@graphql-hive/gateway/opentelemetry/setup';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const RESPONSE_CACHE_ENABLED = process.env['RESPONSE_CACHE_ENABLED'] == 'true';

openTelemetrySetup({
  contextManager: new AsyncLocalStorageContextManager(),
  resource: {
    serviceName: RESPONSE_CACHE_ENABLED ? 'with-cache' : 'without-cache',
    serviceVersion: '1.0.0',
  },
  traces: {
    exporter: new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
    // batching: false,
  },
});
export const gatewayConfig = defineConfig({
  openTelemetry: {
    traces: true,
  },
  cache: {
    type: 'redis',
    url: process.env['REDIS_URL'], // The URL of the Redis server
    lazyConnect: false,
  },
  responseCaching: RESPONSE_CACHE_ENABLED
    ? {
        ttl: 0,
        ttlPerType: {
          'Query.me': 2000,
        },
        session: () => null,
      }
    : undefined,
  maskedErrors: false,
});
