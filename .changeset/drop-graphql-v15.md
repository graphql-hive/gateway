---
'@graphql-tools/batch-delegate': major
'@graphql-tools/batch-execute': major
'@graphql-tools/delegate': major
'@graphql-tools/executor-common': major
'@graphql-tools/executor-graphql-ws': major
'@graphql-tools/executor-http': major
'@graphql-tools/federation': major
'@graphql-mesh/fusion-runtime': major
'@graphql-hive/gateway': major
'@graphql-hive/nestjs': major
'@graphql-hive/plugin-aws-sigv4': major
'@graphql-hive/plugin-deduplicate-request': major
'@graphql-mesh/hmac-upstream-signature': major
'@graphql-mesh/plugin-jwt-auth': major
'@graphql-hive/plugin-mcp': major
'@graphql-hive/plugin-opentelemetry': major
'@graphql-mesh/plugin-prometheus': major
'@graphql-hive/router-runtime': major
'@graphql-hive/gateway-runtime': major
'@graphql-tools/stitch': major
'@graphql-tools/stitching-directives': major
'@graphql-hive/gateway-testing': major
'@graphql-mesh/transport-common': major
'@graphql-mesh/transport-http-callback': major
'@graphql-mesh/transport-http': major
'@graphql-mesh/transport-ws': major
'@graphql-tools/wrap': major
---

Drop GraphQL v15 (and older) support. Only GraphQL v16 and v17 are supported now.

Upgrade to `graphql@^16` or `graphql@^17`. Hive Gateway packages require `graphql@^16.9.0` or later.

`@graphql-tools/stitch` no longer reads legacy `#` comment descriptions (`commentDescriptions`, removed in GraphQL v16) from type definitions; use string descriptions (`"""..."""`) instead.
