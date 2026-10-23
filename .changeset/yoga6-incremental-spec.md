---
'@graphql-tools/executor-http': major
'@graphql-tools/executor-common': major
'@graphql-tools/utils': major
'@graphql-tools/delegate': major
'@graphql-tools/stitch': major
'@graphql-tools/batch-execute': major
'@graphql-tools/batch-delegate': major
'@graphql-tools/federation': major
'@graphql-tools/wrap': major
'@graphql-tools/stitching-directives': major
'@graphql-mesh/fusion-runtime': major
'@graphql-hive/gateway-runtime': major
'@graphql-hive/gateway': major
'@graphql-hive/nestjs': major
'@graphql-mesh/transport-http': major
'@graphql-mesh/transport-common': major
'@graphql-mesh/transport-ws': major
'@graphql-mesh/transport-http-callback': major
'@graphql-mesh/hmac-upstream-signature': major
---

Align Hive Gateway with GraphQL Yoga 6, GraphQL Tools majors, and whatwg-node 0.12/0.13 for incremental delivery. Drop Node 20 and GraphQL 15.

### Breaking changes

- **Node**: `engines.node` is now `>=22.18.0` (Node 20 removed from CI). Upstream whatwg-node requires `>=22.15.0`.
- **GraphQL**: peer range is `^16.0.0 || ^17.0.0` (GraphQL 14/15 dropped).
- **Dependencies**: `graphql-yoga@^6`, `@graphql-yoga/plugin-defer-stream@^4`, `@graphql-tools/utils@^13`, `@graphql-tools/executor@^4`, `@graphql-tools/schema@^11`, `@whatwg-node/fetch@^0.12`, `@whatwg-node/server@^0.13`, `@whatwg-node/promise-helpers@^2`, and Envelop packages that peer on `@envelop/core@^6`.
- **Logger**: Yoga’s `logging` option accepts `@graphql-hive/logger` `Logger` (not `LegacyLogger`). `yoga.logger` → `yoga.log`; `YogaLogger` / `createLogger` removed. `TransportContext.logger` removed; use `log` only. Request ids are owned by Yoga’s `requestId` option; Gateway only forwards the id upstream. `createLoggerFromLogging` / `useConfigInServerContext` are taken from `graphql-yoga`.
- **Request body**: `maxRequestBodySize?: number | false` (default 25MB) is forwarded to Yoga; set `false` to disable.
- **Persisted documents**: deprecated `allowArbitraryOperations` gateway option removed; use `allowArbitraryDocuments`.
- **executor-http**: deprecated unused `disposable` option removed (executors are always disposable).
- **crypto**: `@whatwg-node/fetch` no longer exports `crypto`; use platform `crypto` (same as `globalThis.crypto` on Node ≥22.15). Gateway still puts that platform `crypto` on its `fetchAPI` object for nested Yoga 5 peer typings.
- **Hive Console `usage.clientInfo`**: object form removed; pass a `(context) => ClientInfo | null` function.
- **Stitching directives**: `stitchingDirectivesTypeDefs` alias removed; use `allStitchingDirectivesTypeDefs`.
- **CLI**: `--hive-registry-token` and `--hive-usage-target` removed; use `--hive-access-token` with `--hive-target` (or usage/trace-specific tokens).
- **Rate limiting config**: pass `rateLimiting: { config: [...] }` (bare array form removed).
- **delegate `createDeferred`**: removed; use `Promise.withResolvers()`.
- **Removed helpers** (same table as [graphql-tools#8515](https://github.com/ardatan/graphql-tools/pull/8515) / Yoga 6): use `new GraphQLError(...)`, `Promise.withResolvers()`, `@whatwg-node/promise-helpers` (`handleMaybePromise`, `mapAsyncIterator`, `MaybePromise`, …), and `asGetArgumentValuesVariables` / `coerceGetVariableValuesResult` from utils.

### Incremental delivery (`@defer` / `@stream`)

Client Accept (gateway responses) and upstream Accept (subgraph calls) are separate:

| Direction | Default | Force |
| --- | --- | --- |
| Client → Gateway (Yoga) | Negotiate from `Accept`; echo spec on `Content-Type` | n/a (client-driven) |
| Gateway → Subgraph (`executor-http`) | Bare `multipart/mixed` (no spec param) | `incrementalSpec: 'v0.1' \| 'v0.2'` on executor or `ExecutionRequest` |

| Spec | Accept / Content-Type parameter | Payload |
| --- | --- | --- |
| `'v0.1'` | `multipart/mixed;deferSpec=20220824` | `{ incremental: [{ path, label, data \| items }], hasNext }` |
| `'v0.2'` | `multipart/mixed;incrementalSpec=v0.2` | `pending` / `id` / `subPath` / `completed` |

`mergeIncrementalResult` merges both formats. Force `'v0.1'` when stitching `IncrementalReceiver` needs path/label patches.

### Migration

