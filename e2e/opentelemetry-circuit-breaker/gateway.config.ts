import { defineConfig } from '@graphql-hive/gateway';
import { CircuitBreakerExporter } from '@graphql-hive/plugin-opentelemetry';
import { hiveTracingSetup } from '@graphql-hive/plugin-opentelemetry/setup';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

hiveTracingSetup({
  contextManager: new AsyncLocalStorageContextManager(),
  // custom processor to simplify testing, we're really testing the circuit breaker here, not the exporter
  processor: new SimpleSpanProcessor(
    new CircuitBreakerExporter(
      new OTLPTraceExporter({
        url: process.env['HIVE_TRACING_ENDPOINT'],
        headers: {
          Authorization: `Bearer heysupersecret`,
          'X-Hive-Target-Ref': 'some/tar/get',
        },
      }),
      JSON.parse(process.env['CIRCUIT_BREAKER_CONFIG']!),
    ),
  ),
});

export const gatewayConfig = defineConfig({
  openTelemetry: {
    traces: true,
  },
});
