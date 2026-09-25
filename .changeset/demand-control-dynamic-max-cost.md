---
'@graphql-hive/gateway-runtime': minor
---

Allow `maxCost` in `DemandControlPluginOptions` to accept a function for dynamic cost limiting.

Previously, `maxCost` only accepted a static `number`. It now also accepts a synchronous or
asynchronous function `(payload: DemandControlMaxCostPayload) => MaybePromise<number>`, where
`payload` contains:

- `operationCost` – the estimated cost of the current subgraph operation
- `totalCost` – the accumulated cost for the whole request context so far
- `subgraphName` – the name of the subgraph being executed
- `executionRequest` – the full execution request object

This lets you implement per-user rate limits, per-subgraph budgets, or any other context-aware
cost policy. The `DemandControlMaxCostPayload` interface is exported from the package for use
when typing your `maxCost` function.
