---
"@graphql-mesh/hmac-upstream-signature": minor
"@graphql-hive/plugin-deduplicate-request": minor
"@graphql-mesh/transport-http-callback": minor
"@graphql-hive/plugin-opentelemetry": minor
"@graphql-tools/executor-graphql-ws": minor
"@graphql-tools/stitching-directives": minor
"@graphql-mesh/plugin-prometheus": minor
"@graphql-mesh/transport-common": minor
"@graphql-tools/executor-common": minor
"@graphql-mesh/transport-http": minor
"@graphql-tools/batch-delegate": minor
"@graphql-tools/executor-http": minor
"@graphql-mesh/fusion-runtime": minor
"@graphql-hive/router-runtime": minor
"@graphql-tools/batch-execute": minor
"@graphql-mesh/transport-ws": minor
"@graphql-tools/federation": minor
"@graphql-tools/delegate": minor
"@graphql-hive/gateway": minor
"@graphql-hive/gateway-runtime": minor
"@graphql-hive/gateway-testing": minor
"@graphql-hive/nestjs": minor
"@graphql-tools/stitch": minor
"@graphql-tools/wrap": minor
---

Support GraphQL 16 with @graphql-tools/utils v12

Preserves GraphQL 16 compatibility while upgrading to `@graphql-tools/utils` v12, `@graphql-tools/executor` v2, and the compatible `@graphql-tools/schema` and `@graphql-tools/merge` releases. Consumers now receive consistent resolver and execution request types without conflicts between different GraphQL Tools versions.

Stitched and delegated operations handle the new executor variable result shape correctly, including variables used by directives. Resolver execution also supports the executor's cancellation and asynchronous work helpers while remaining compatible with the GraphQL 16 `GraphQLResolveInfo` API.
