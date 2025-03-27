---
'@graphql-mesh/plugin-opentelemetry': major
---

The OpenTelemetry integration have been entirely overhauled.

**This Release contains breaking changes, please read [Breaking Changes](#breaking-changes) section below**

## Improvements

### Span parenting

The spans of the different phases of the request handling have been fixed.

Now, spans are parented as expected, and Hive Gateway is now compatible with Grafana's "critical path" feature.

#### Context Manager

By default, if `initializeNodeSDK` is `true` (default), the plugin will try to install an `AsyncLocalStorage` based Context Manager.

You can configure an alternative context manager (or entirely disable it) with `contextManager` new option.

#### Extended span coverage

Spans also now covers the entire duration of each phases, including the plugin hooks execution.

### Custom spans and standard instrumentation support

We are now fully compatible with OpenTelemetry Context, meaning you can now create custom spans
inside your plugins, or enable standard OTEL instrumentation like Node SDK.

The custom spans will be parented correctly thanks to OTEL Context.

```ts
const useMyPlugin = () => {
  const tracer = otel.trace.getTracer('hive-gateway');
  return {
    async onExecute() {
      await otel.startActiveSpan('my-custom-span', async () => {
        // do something
      });
    },
  };
};
```

You can also enable Node SDK standard instrumentations (or instrumentation specific to your runtime).
They will also be parented correctly:

```ts
// otel-setup.ts
import otel from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import './setup.js';
import { defineConfig } from '@graphql-hive/gateway';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
  // Enable Node standard instrumentations
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: 'hive-gateway',
});

sdk.start();

// This is required for the OTEL context to be properly propagated and spans correlated with Hive's integration.
otel.context.setGlobalContextManager(new AsyncLocalStorageContextManager());

// gateway.config.ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  opentelemetry: {
    initializeNodeSDK: false,
  },
});
```

### New `graphql.operation` span with Batched Queries support

The plugin now exports a new span `graphql.operation <Operation Name>` which represent the handling of a graphql operation.

This enables the support of Batched queries. If enabled the root `POST /graphql` span will contain
one `graphql.operation <Operation Name>` span for each graphql operation contained in the HTTP request.

### Support of Upstream Retry

The plugin now support standard OTEL attribute for request retry (`http.request.resend_count`).

If enabled, you will see one `http.fetch` span for each try under `subgraph.execute (<subgraph name>)` spans.

### Support of custom attributes

Thanks to OTEL Context, you can now add custom attributes to the current span:

```ts
import otel from '@opentelemetry/api'

const useMyPlugin = () => ({
  async onRequestParse({ request }) => ({
    const userId = await getUserIdForRequest(request);
    otel.trace.getSpan()?.setAttribute('user_id', userId);
  })
})
```

## Breaking Changes

### Spans Parenting

Spans are now parented correctly, which can break your Grafana (or other visualization and alerting tools) setup.
Please carefully review your span queries to check if they rely on span parent.

### Spans configuration

Spans can be skipped based on the result of a predicate function. The parameter of those functions have been narrowed down, and contains less data.

If your configuration contains skip functions, please review the types to adapt to the new API.

### Async Local Storage Context Manager

When `initializeNodeSDK` is set to `true` (the default), the plugin tries to enable an Async Local Storage based Context Manager.
This is needed to ensure correct correlation of spans created outside of the plugin.

While this should not break anything, the usage of `AsyncLocalStorage` can slightly reduce performances of the Gateway.

If you don't need to correlate with any OTEL official instrumentations or don't need OTEL context for custom spans, you can disable it by setting the `contextManager` option:

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  opentelemetry: {
    contextManager: false,
  },
});
```
