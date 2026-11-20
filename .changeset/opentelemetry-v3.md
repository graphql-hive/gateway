---
'@graphql-hive/gateway': major
'@graphql-hive/plugin-opentelemetry': major
---

Upgrade to OpenTelemetry JS SDK 3

The OpenTelemetry plugin and Hive Gateway use OpenTelemetry JS SDK 3: the stable packages like `@opentelemetry/core`, `@opentelemetry/resources`, `@opentelemetry/sdk-trace` and `@opentelemetry/sdk-logs` at 3.x, the experimental packages like `@opentelemetry/sdk-node` and the OTLP exporters at 0.301.x, and `@opentelemetry/api` 1.10. SDK 2.x packages can't be used together with `@opentelemetry/api` 1.10, so custom code using OpenTelemetry packages has to upgrade to SDK 3 too. The [OpenTelemetry JS 3.x migration guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/3.x/migration-guide.md) describes all changes, the ones affecting the gateway are listed below.

## `@opentelemetry/sdk-trace` replaces `@opentelemetry/sdk-trace-base`

OpenTelemetry removed `@opentelemetry/sdk-trace-base` and `@opentelemetry/sdk-trace-node` in favour of `@opentelemetry/sdk-trace`. The Hive Gateway package depends on `@opentelemetry/sdk-trace` instead of `@opentelemetry/sdk-trace-base`, and the Docker images and the binary bundle it instead. Import the samplers, processors and exporters from `@opentelemetry/sdk-trace`. `BasicTracerProvider` is called `TracerProvider`, and the span processors take the exporter as an option:

```ts
import { openTelemetrySetup } from '@graphql-hive/gateway/opentelemetry/setup';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace';

openTelemetrySetup({
  contextManager: new AsyncLocalStorageContextManager(),
  traces: {
    processors: [
      // instead of new SimpleSpanProcessor(new OTLPTraceExporter())
      new SimpleSpanProcessor({ exporter: new OTLPTraceExporter() }),
    ],
  },
});
```

The batching options of `openTelemetrySetup` and `hiveTracingSetup` (`BufferConfig`) are exported from `@graphql-hive/plugin-opentelemetry/setup` and `@graphql-hive/gateway/opentelemetry/setup`.

## Environment variables for batching and limits

`openTelemetrySetup`, `hiveTracingSetup` and the `--opentelemetry` CLI option don't read the `OTEL_BSP_*` environment variables (`OTEL_BSP_SCHEDULE_DELAY`, `OTEL_BSP_EXPORT_TIMEOUT`, `OTEL_BSP_MAX_QUEUE_SIZE` and `OTEL_BSP_MAX_EXPORT_BATCH_SIZE`) and the attribute, span, event and link limit environment variables (like `OTEL_ATTRIBUTE_COUNT_LIMIT` or `OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT`), because the trace SDK doesn't read environment variables anymore. Configure batching with the `traces.batching` option and limits with the `traces.spanLimits` option, or set up the SDK with `NodeSDK` from `@opentelemetry/sdk-node`, which still reads the OpenTelemetry environment variables.

## `generalLimits` option removed

The tracer provider of SDK 3 doesn't accept general limits. The `generalLimits` option of `openTelemetrySetup` is removed, set `attributeCountLimit` and `attributeValueLengthLimit` in `traces.spanLimits` instead.

```ts
openTelemetrySetup({
  contextManager: new AsyncLocalStorageContextManager(),
  traces: {
    exporter: new OTLPTraceExporter(),
    // instead of generalLimits: { attributeCountLimit: 64 }
    spanLimits: { attributeCountLimit: 64 },
  },
});
```

## Logs API is part of `@opentelemetry/api`

OpenTelemetry moved the Logs API into `@opentelemetry/api` and removed `@opentelemetry/api-logs`. The Hive Gateway package doesn't depend on `@opentelemetry/api-logs`, and the Docker images and the binary don't bundle it. Import `logs`, `SeverityNumber` and the `Logger` types from `@opentelemetry/api`, or from `@graphql-hive/gateway/opentelemetry/api` which re-exports it.

```ts
// instead of import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { logs, SeverityNumber } from '@opentelemetry/api';
```

## `@opentelemetry/sdk-node` in the Docker images and the binary

The bundled `@opentelemetry/sdk-node` exports `NodeSDK`, `startNodeSdk` and the configuration types. It has no default export and no namespace re-exports anymore (`api`, `contextBase`, `core`, `logs`, `metrics`, `node`, `resources` and `tracing`). Import from the packages directly, they're bundled too:

```ts
// instead of import { NodeSDK, resources, tracing } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
```

## `AsyncHooksContextManager` removed

The bundled `@opentelemetry/context-async-hooks` exports only `AsyncLocalStorageContextManager`, OpenTelemetry removed `AsyncHooksContextManager`.

## Deep imports

OpenTelemetry packages declare their entry points with `exports`, so imports of files inside a package, like `@opentelemetry/core/build/src/...`, don't resolve anymore. Import from the package name instead.
