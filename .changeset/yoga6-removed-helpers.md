---
'@graphql-tools/executor-http': major
'@graphql-tools/executor-common': major
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

Align with GraphQL Yoga 6 / GraphQL Tools majors / whatwg-node: stop using removed helpers.

| Removed | Replacement |
| --- | --- |
| `createGraphQLError` | `new GraphQLError(...)` |
| `YogaLogger` / `createLogger` / `yoga.logger` | `Logger` / `yoga.log` |
| `crypto` from `@whatwg-node/fetch` | platform `crypto` (Node >=22.15); Gateway still exposes it on `fetchAPI` for Yoga 5 peers |
| `mapMaybePromise` and related utils re-exports | `@whatwg-node/promise-helpers` (`handleMaybePromise`, …) |
| `createDeferred` / `createDeferredPromise` | `Promise.withResolvers()` |

See [graphql-tools#8515](https://github.com/ardatan/graphql-tools/pull/8515) and [yoga#4623](https://github.com/graphql-hive/graphql-yoga/pull/4623).
