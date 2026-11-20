---
'@graphql-hive/gateway': major
---

Drop the OpenTelemetry Jaeger exporter and propagator

The Hive Gateway package doesn't depend on `@opentelemetry/exporter-jaeger` and `@opentelemetry/propagator-jaeger`, and the Docker images and the binary don't bundle `@opentelemetry/propagator-jaeger`. OpenTelemetry JS SDK 3 removed both packages: Jaeger deprecated its Thrift protocol in favour of OTLP, and the OpenTelemetry specification deprecated the Jaeger propagator in favour of W3C Trace Context.

## Exporting traces to Jaeger

Jaeger receives OTLP natively. Use the OTLP exporters, for example with the `--opentelemetry` CLI option pointing to Jaeger's OTLP HTTP endpoint:

```sh
hive-gateway supergraph --opentelemetry "http://jaeger:4318/v1/traces"
```

Or in the configuration:

```ts
import { defineConfig } from '@graphql-hive/gateway';
import { openTelemetrySetup } from '@graphql-hive/gateway/opentelemetry/setup';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

openTelemetrySetup({
  contextManager: new AsyncLocalStorageContextManager(),
  traces: {
    exporter: new OTLPTraceExporter({ url: 'http://jaeger:4318/v1/traces' }),
  },
});

export const gatewayConfig = defineConfig({
  openTelemetry: { traces: true },
});
```

## Propagating trace context

The gateway propagates the W3C Trace Context (`traceparent`) and W3C Baggage headers by default. Services that still send or expect the `uber-trace-id` header have to switch to W3C Trace Context, otherwise their traces aren't correlated with the gateway's. The `jaeger` value of the `OTEL_PROPAGATORS` environment variable is not recognised by the OpenTelemetry Node SDK anymore, use `tracecontext` instead.
