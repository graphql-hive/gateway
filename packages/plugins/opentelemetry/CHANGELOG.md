# @graphql-hive/plugin-opentelemetry

## 1.0.2
### Patch Changes

- Updated dependencies [[`20f4880`](https://github.com/graphql-hive/gateway/commit/20f48801dbab0aaccc7aa68f0447f7f5504cb0f7)]:
  - @graphql-hive/gateway-runtime@2.0.2

## 1.0.1
### Patch Changes



- [#1439](https://github.com/graphql-hive/gateway/pull/1439) [`65eef45`](https://github.com/graphql-hive/gateway/commit/65eef45eb372f20afa7907a2be1c9cef345bb893) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Create default logger if not supplied when setting up

- Updated dependencies [[`65eef45`](https://github.com/graphql-hive/gateway/commit/65eef45eb372f20afa7907a2be1c9cef345bb893)]:
  - @graphql-hive/gateway-runtime@2.0.1
  - @graphql-mesh/transport-common@1.0.1

## 1.0.0
### Major Changes



- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Drop Node 18 support
  
  Least supported Node version is now v20.


- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - This plugin has been renamed from `@graphql-mesh/plugin-opentelemetry` to `@graphql-hive/plugin-opentelemetry`
  
  `@graphql-mesh/plugin-opentelemetry` is now deprecated and you are advised to upgrade and use the new `@graphql-hive/plugin-opentelemetry`. Please find the necessary documentation on the [Hive Gateway documentation website](https://the-guild.dev/graphql/hive/docs/gateway).
  
  ```diff
  - @graphql-mesh/plugin-opentelemetry
  + @graphql-hive/plugin-opentelemetry
  ```


- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Introduce and use the new Hive Logger
  
  - [Read more about it on the Hive Logger documentation here.](https://the-guild.dev/graphql/hive/docs/logger)
  
  - If coming from Hive Gateway v1, [read the migration guide here.](https://the-guild.dev/graphql/hive/docs/migration-guides/gateway-v1-v2)


- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - The OpenTelemetry integration have been entirely overhauled.
  
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


- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - **Breaking Change**: Removal of the Azure exporter (`createAzureMonitorExporter`). Please use `@azure/monitor-opentelemetry-exporter` directly instead.


### Minor Changes



- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Add a configurable sampling rate. The sampling strategy relies on a determenistic probability sampler with a parent priority, meaning that if a span is sampled, all its children spans will also be sampled.



- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Add support of Yoga. This plugin is now usable in Yoga too, which allows for better opentelemetry traces in subgraphs.


### Patch Changes



- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - dependencies updates:
  
  - Updated dependency [`@opentelemetry/core@^2.0.1` ↗︎](https://www.npmjs.com/package/@opentelemetry/core/v/2.0.1) (from `^1.30.0`, in `dependencies`)
  - Updated dependency [`@opentelemetry/exporter-trace-otlp-grpc@^0.203.0` ↗︎](https://www.npmjs.com/package/@opentelemetry/exporter-trace-otlp-grpc/v/0.203.0) (from `^0.57.0`, in `dependencies`)
  - Updated dependency [`@opentelemetry/exporter-trace-otlp-http@^0.203.0` ↗︎](https://www.npmjs.com/package/@opentelemetry/exporter-trace-otlp-http/v/0.203.0) (from `^0.57.0`, in `dependencies`)
  - Updated dependency [`@opentelemetry/instrumentation@^0.203.0` ↗︎](https://www.npmjs.com/package/@opentelemetry/instrumentation/v/0.203.0) (from `^0.57.0`, in `dependencies`)
  - Updated dependency [`@opentelemetry/resources@^2.0.1` ↗︎](https://www.npmjs.com/package/@opentelemetry/resources/v/2.0.1) (from `^1.29.0`, in `dependencies`)
  - Updated dependency [`@opentelemetry/sdk-trace-base@^2.0.1` ↗︎](https://www.npmjs.com/package/@opentelemetry/sdk-trace-base/v/2.0.1) (from `^1.29.0`, in `dependencies`)
  - Updated dependency [`@opentelemetry/semantic-conventions@^1.36.0` ↗︎](https://www.npmjs.com/package/@opentelemetry/semantic-conventions/v/1.36.0) (from `^1.28.0`, in `dependencies`)
  - Updated dependency [`@whatwg-node/promise-helpers@1.3.0` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.3.0) (from `^1.3.0`, in `dependencies`)
  - Added dependency [`@graphql-hive/core@^0.13.0` ↗︎](https://www.npmjs.com/package/@graphql-hive/core/v/0.13.0) (to `dependencies`)
  - Added dependency [`@graphql-hive/logger@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-hive/logger/v/workspace:^) (to `dependencies`)
  - Added dependency [`@opentelemetry/api-logs@^0.203.0` ↗︎](https://www.npmjs.com/package/@opentelemetry/api-logs/v/0.203.0) (to `dependencies`)
  - Added dependency [`@opentelemetry/auto-instrumentations-node@^0.62.1` ↗︎](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node/v/0.62.1) (to `dependencies`)
  - Added dependency [`@opentelemetry/context-async-hooks@^2.0.1` ↗︎](https://www.npmjs.com/package/@opentelemetry/context-async-hooks/v/2.0.1) (to `dependencies`)
  - Added dependency [`@opentelemetry/sdk-logs@^0.203.0` ↗︎](https://www.npmjs.com/package/@opentelemetry/sdk-logs/v/0.203.0) (to `dependencies`)
  - Added dependency [`@opentelemetry/sdk-node@^0.203.0` ↗︎](https://www.npmjs.com/package/@opentelemetry/sdk-node/v/0.203.0) (to `dependencies`)
  - Removed dependency [`@azure/monitor-opentelemetry-exporter@^1.0.0-beta.27` ↗︎](https://www.npmjs.com/package/@azure/monitor-opentelemetry-exporter/v/1.0.0) (from `dependencies`)
  - Removed dependency [`@opentelemetry/exporter-zipkin@^1.29.0` ↗︎](https://www.npmjs.com/package/@opentelemetry/exporter-zipkin/v/1.29.0) (from `dependencies`)
  - Removed dependency [`@opentelemetry/sdk-trace-web@^1.29.0` ↗︎](https://www.npmjs.com/package/@opentelemetry/sdk-trace-web/v/1.29.0) (from `dependencies`)


- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Fix the types exporters factories, the configuration is actually optional. All parameters can be determined from environement variables.

- Updated dependencies [[`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a), [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a)]:
  - @graphql-hive/gateway-runtime@2.0.0
  - @graphql-mesh/transport-common@1.0.0
  - @graphql-hive/logger@1.0.1
