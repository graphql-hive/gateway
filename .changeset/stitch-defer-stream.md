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

**Subgraph-forwarded `@defer`:** set `defer: true` on a `SubschemaConfig` (or `defer: true` on `getStitchedSchemaFromSupergraphSdl`) to forward `@defer` to that subgraph and merge incremental patches via `IncrementalReceiver`. With `batch: true`, batched sub-requests are wrapped in `@defer` so a defer-capable executor can deliver fast siblings without waiting for the slowest (see `batchingOptions.defer`).

**Hive Gateway config:** extend `deferStream` instead of a separate flag:

```ts
deferStream: true // client-facing only (gateway-owned omit)
deferStream: { subgraph: true } // also forward @defer to all subgraphs
deferStream: { subgraph: { users: true, '*': false } } // per-subgraph
```

Single-request batching no longer drains incremental AsyncIterables into one result, so forwarded `@defer` can flush the initial payload before deferred patches arrive.

`@graphql-tools/executor-http` adds `mergeIncremental` (default `true`: legacy growing snapshots). Set `mergeIncremental: false` to yield raw multipart parts like the default schema executor. Hive Gateway's `@graphql-mesh/transport-http` always uses passthrough (`mergeIncremental: false`).

`IncrementalReceiver` prefers raw patches and cheaply tolerates accumulated snapshots (only fills missing keys). The HTTP executor preserves `hasNext` in accumulate mode.

`@stream` continues to be forwarded on field directives as before.
