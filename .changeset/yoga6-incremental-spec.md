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
- **Logger**: Yoga’s `logging` option accepts `@graphql-hive/logger` `Logger` (not `LegacyLogger`). `yoga.logger` → `yoga.log`; `YogaLogger` / `createLogger` removed.
- **crypto**: `@whatwg-node/fetch` no longer exports `crypto`; use `globalThis.crypto`. Do not put `crypto` on `fetchAPI`.
- **Removed helpers** (same table as [graphql-tools#8515](https://github.com/ardatan/graphql-tools/pull/8515) / Yoga 6): use `new GraphQLError(...)`, `Promise.withResolvers()`, `@whatwg-node/promise-helpers` (`handleMaybePromise`, `mapAsyncIterator`, `MaybePromise`, …), and `asGetArgumentValuesVariables` / `coerceGetVariableValuesResult` from utils.

### Incremental delivery (`@defer` / `@stream`)

`@graphql-tools/executor-http` negotiates upstream `Accept` through `INCREMENTAL_DELIVERY_SPECS` from `@graphql-tools/utils`:

| Spec | Accept / Content-Type parameter | Payload |
| --- | --- | --- |
| `'v0.1'` (default) | `multipart/mixed;deferSpec=20220824` | `{ incremental: [{ path, label, data \| items }], hasNext }` |
| `'v0.2'` | `multipart/mixed;incrementalSpec=v0.2` | `pending` / `id` / `subPath` / `completed` |

Set `incrementalSpec` on `buildHTTPExecutor({ incrementalSpec })` or on `ExecutionRequest.incrementalSpec`. Yoga 6 maps client `Accept` the same way for gateway responses. `mergeIncrementalResult` merges both formats. Stitching `IncrementalReceiver` still expects v0.1; HTTP executor defaults to `'v0.1'` for subgraph forward.

### Migration

See `docs/migration-yoga6-tools.md` for the import replacement table, whatwg-node notes, and Node/GraphQL upgrade order.
