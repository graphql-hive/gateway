---
'@graphql-hive/plugin-opentelemetry': minor
'@graphql-hive/gateway': minor
---

New attributes on http, graphql operation and subgraph execution to make it easier to find those "root" spans.

- HTTP span: `hive.request: true` and `hive.request.id: <request-id>` if `requestId` exists
- GraphQL operation : `hive.graphql: true`
- Subgraph Execution : `hive.upstream: true`
