# Migration: Yoga 6, GraphQL Tools majors, whatwg-node, Node 22+

This guide covers upgrading Hive Gateway (and workspace `@graphql-tools/*` packages) onto the stack released with:

- [graphql-yoga@6.0.0](https://github.com/graphql-hive/graphql-yoga/releases/tag/graphql-yoga%406.0.0)
- [@graphql-yoga/plugin-defer-stream@4.0.0](https://github.com/graphql-hive/graphql-yoga/releases/tag/%40graphql-yoga%2Fplugin-defer-stream%404.0.0)
- [graphql-tools#8515](https://github.com/ardatan/graphql-tools/pull/8515) (drop GraphQL 14/15, Node 22+)
- [graphql-tools#8550](https://github.com/ardatan/graphql-tools/pull/8550) / [#8552](https://github.com/ardatan/graphql-tools/pull/8552) (incremental delivery v0.1 / v0.2)
- [graphql-yoga#4623](https://github.com/graphql-hive/graphql-yoga/pull/4623) (Accept → `incrementalSpec`)
- [@whatwg-node/fetch@0.12](https://github.com/ardatan/whatwg-node/blob/master/packages/fetch/CHANGELOG.md) / [@whatwg-node/server@0.13](https://github.com/ardatan/whatwg-node) (Node 22.15+, crypto removal)

## Upgrade order

1. Move runtimes to **Node 22.18+** (Hive Gateway engines; whatwg-node floor is **22.15**). Drop Node 18/20.
2. Move apps to **graphql 16 or 17** (drop 14/15).
3. Bump Hive Gateway / `@graphql-tools/*` / `graphql-yoga` / `@whatwg-node/*` together (peer ranges are coupled).

## Import replacements

| Removed                                                                      | Replacement                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `createGraphQLError` from utils / Yoga                                       | `new GraphQLError(message, options)` from `graphql`                                          |
| `mapMaybePromise`                                                            | `handleMaybePromise` from `@whatwg-node/promise-helpers`                                     |
| `isPromise` / `fakePromise` / `mapAsyncIterator` / `MaybePromise` from utils | `@whatwg-node/promise-helpers`                                                               |
| `createDeferred` / `createDeferredPromise` from utils                        | `Promise.withResolvers()` or `createDeferredPromise` from `@whatwg-node/promise-helpers`     |
| `DisposableSymbols` from utils                                               | `@whatwg-node/server` or `@whatwg-node/disposablestack`                                      |
| `mergeSchemas` re-export from Yoga                                           | `@graphql-tools/schema`                                                                      |
| `getSchemaCoordinate` re-export from Yoga                                    | `@graphql-tools/utils`                                                                       |
| `yoga.logger`                                                                | `yoga.log`                                                                                   |
| `YogaLogger` / `createLogger` from Yoga                                      | `Logger` from `graphql-yoga` / `@graphql-hive/logger` (`new Logger({ level })`)              |
| `createYoga({ logging: LegacyLogger.from(...) })`                            | pass a real `Logger` instance (`logging: log`)                                               |
| Gateway `persistedDocuments.allowArbitraryOperations`                        | `persistedDocuments.allowArbitraryDocuments`                                                 |
| `buildHTTPExecutor({ disposable })`                                          | remove (always disposable)                                                                   |
| `crypto` from `@whatwg-node/fetch` / `fetchAPI.crypto`                       | `globalThis.crypto` (available on Node ≥22.15)                                               |
| GraphQL 16/17 `getArgumentValues` / `getVariableValues` shape drift          | `asGetArgumentValuesVariables` / `coerceGetVariableValuesResult` from `@graphql-tools/utils` |

## Logger (Yoga 6)

- `@graphql-yoga/logger` is removed; Yoga re-exports `Logger`, `MemoryLogWriter`, `LogLevel` from `@graphql-hive/logger`.
- `createYoga({ logging })` accepts `boolean | Logger | LogLevel` only - not the deprecated `LegacyLogger` adapter.
- Prefer request-scoped `context.log` / `serverContext.log` (correlated via `requestId`).
- **Request ids**: Gateway passes `requestId` through to Yoga (`createYoga({ requestId })`). Minting, response `x-request-id`, and `log.child({ requestId })` are Yoga’s job. Gateway only forwards `context.log.attrs.requestId` on upstream `fetch`.
- Do not dual-write a deprecated `logger` on the request just for Yoga - use `log`.
- `createLoggerFromLogging` / `useConfigInServerContext` come from `graphql-yoga` (re-exported from `@graphql-hive/gateway-runtime` where needed).

## Request body size

- `maxRequestBodySize?: number | false` on gateway config is passed through to Yoga (`@default` 25_000_000). Set `false` to disable the limit (e.g. sync fetch tests that need an unbounded body).

## whatwg-node 0.12 / 0.13

Aligned with Yoga 6 dependency bumps:

- **`engines.node`**: `>=22.15.0` upstream; Gateway packages declare `>=22.18.0`.
- **`@whatwg-node/fetch`**: no longer exports `crypto` / `createFetch().crypto`. Use `globalThis.crypto` directly (do not put `crypto` back on `fetchAPI`).
- **`@whatwg-node/promise-helpers` v2**: `mapMaybePromise` removed; use `handleMaybePromise(() => value, ...)`.
- **`@whatwg-node/events`**: removed; use platform `Event` / `EventTarget` / `CustomEvent`.
- Optional `node-libcurl` transport dropped (node HTTP stack only in 0.12).

## Incremental delivery (`@defer` / `@stream`)

Yoga and `@graphql-tools/executor-http` share `INCREMENTAL_DELIVERY_SPECS` from `@graphql-tools/utils`:

| Spec          | Accept / Content-Type parameter        | Payload                                                              |
| ------------- | -------------------------------------- | -------------------------------------------------------------------- |
| (none / bare) | `multipart/mixed`                      | Subgraph chooses; Yoga treats bare multipart as v0.1 for _responses_ |
| `'v0.1'`      | `multipart/mixed;deferSpec=20220824`   | `{ incremental: [{ path, label, data \| items }], hasNext }`         |
| `'v0.2'`      | `multipart/mixed;incrementalSpec=v0.2` | `pending` / `id` / `subPath` / `completed`                           |

Behavior (client vs subgraph are intentionally different):

- **Yoga (gateway ← client)**: maps client `Accept` → executor `incrementalSpec`, echoes the negotiated spec on response `Content-Type`. Unsupported registered parameter values → HTTP **406**. Bare `multipart/mixed` or `deferSpec=20220824` → v0.1; `incrementalSpec=v0.2` → v0.2.
- **`buildHTTPExecutor` (gateway → subgraph)**: by default sends **bare** `multipart/mixed` (no spec parameter) so the subgraph can return a format it supports. Set `buildHTTPExecutor({ incrementalSpec: 'v0.1' | 'v0.2' })` or `ExecutionRequest.incrementalSpec` only when a specific format must be forced (e.g. stitching `IncrementalReceiver` still expects v0.1 path/label patches).
- **`mergeIncrementalResult`** (utils 13): merges both v0.1 path patches and v0.2 `pending`/`id`/`subPath`/`completed`.
- **Gateway HTTP transport**: keeps `mergeIncremental: false` (raw multipart parts for passthrough) and does not force `incrementalSpec`.

A later incremental spec is a utils table row plus an executor publisher; bump `@graphql-tools/utils` / `@graphql-tools/executor` to pick it up.

## Known follow-ups

- `@graphql-hive/yoga` and `@graphql-hive/render-laboratory` may still declare a `graphql-yoga@^5` peer until those packages publish Yoga 6-compatible releases; install may warn until then.
- Hive Router runtime still does not plan incremental delivery; subgraph-forward `@defer` e2e stays stitching-only (`vitest.config.ts` exclude list).
