---
'@graphql-tools/delegate': minor
'@graphql-tools/stitch': minor
'@graphql-tools/batch-execute': minor
'@graphql-tools/federation': minor
'@graphql-tools/executor-http': minor
'@graphql-mesh/transport-http': patch
'@graphql-mesh/fusion-runtime': minor
'@graphql-hive/gateway-runtime': minor
---

Support `@defer` / `@stream` incremental delivery within schema stitching.

**Gateway-owned `@defer` (default):** deferred selections are omitted from subgraph requests (only `@requires` / key dependencies are kept), so nested `@defer` can flush before slow fields resolve. Missing fields are filled later via type-merging or source resolvers.

**Subgraph-forwarded `@defer`:** set `defer: true` on a `SubschemaConfig` (or `defer: true` on `getStitchedSchemaFromSupergraphSdl`) to forward `@defer` to that subgraph and merge incremental patches via `IncrementalReceiver`. With `batch: true` and `batchingOptions.defer` (or `subschema.defer`), multi-request batches wrap each root selection in `@defer` for subgraph compatibility; results are still collected before DataLoader waiters resolve. Single-request batches pass the AsyncIterable through so the initial payload can flush before deferred patches arrive.

**Hive Gateway config:** extend `deferStream` instead of a separate flag:

```ts
deferStream: true // client-facing only (gateway-owned omit)
deferStream: { subgraph: true } // also forward @defer to every subgraph
deferStream: { subgraph: { users: true, '*': false } } // per-subgraph
```

`@graphql-tools/executor-http` adds `mergeIncremental` (default `true`: legacy growing snapshots). Set `mergeIncremental: false` to yield raw multipart parts like the default schema executor. Hive Gateway's `@graphql-mesh/transport-http` always uses passthrough (`mergeIncremental: false`).

`IncrementalReceiver` prefers raw patches and cheaply tolerates accumulated snapshots (only fills missing keys). The HTTP executor preserves `hasNext` in accumulate mode.

`@stream` continues to be forwarded on field directives as before. List streaming in `@graphql-tools/delegate` uses a plain async generator (no `@repeaterjs/repeater` dependency).
