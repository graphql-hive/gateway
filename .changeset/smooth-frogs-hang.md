---
'@graphql-mesh/plugin-prometheus': minor
---

Allow to explicitly control which events and timing should be observe.

Each metric can now be configured to observe events and timings only for certain GraphQL pipeline
phases, or depending on the request context.

## Example: trace only execution and subscription errors

```ts
import { defineConfig } from '@graphql-hive/gateway';

const TRACKED_OPERATION_NAMES = [
  // make a list of operation that you want to monitor
]

export const gatewayConfig = defineConfig({
  prometheus: {
    metrics: {
      // Here, an array of phases can be provided to enable the metric only on certain phases.
      // In this example, only error happening during the execute and subscribe phases will tracked
      graphql_envelop_phase_error: ['execute', 'subscribe']
    }
  }
})
```

## Example: Monitor timing only of a set of operations by name

```ts
import { defineConfig } from '@graphql-hive/gateway';

const TRACKED_OPERATION_NAMES = [
  // make a list of operation that you want to monitor
]

export const gatewayConfig = defineConfig({
  prometheus: {
      metrics: {
        graphql_yoga_http_duration: createHistogram({
          registry,
          histogram: {
            name: 'graphql_envelop_request_duration',
            help: 'Time spent on HTTP connection',
            labelNames: ['operationName']
          },
          fillLabelsFn: ({ operationName }, _rawContext) => ({ operationName, }),
          phases: ['execute', 'subscribe'],

          // Here `shouldObserve` control if the request timing should be observed, based on context
          shouldObserve: ({ operationName }) => TRACKED_OPERATIONS.includes(operationName),
        })
      },
  }
})
```

## Default Behavior Change

A metric is enabled using `true` value in metrics options will observe in every
phases available.

Previously, which phase was observe was depending on which other metric were enabled. For example,
this config would only trace validation error:

```ts
prometheus: {
  metrics: {
    graphql_envelop_phase_error: true,
    graphql_envelop_phase_validate: true,
  },
}
```

This is no longer the case. If you were relying on this behavior, please use an array of string to
restrict observed phases.

```ts
prometheus: {
  metrics: {
    graphql_envelop_phase_error: ['validate'],
  },
}
```

## Deprecation

The `fillLabelFn` function was provided the `response` and `request` through the `context` argument.

This is now deprecated, `request` and `response` are now available in the first `params` argument.
This change allows to provide better typing, since `context` is not typed.