---
'@graphql-mesh/fusion-runtime': minor
'@graphql-hive/gateway-runtime': patch
'@graphql-mesh/transport-http-callback': patch
---

Support the incoming Mesh v2 supergraph shape (join transport, core `@link` / `@source`, Connectors without bare `@transport`).

### Migration

No change for existing supergraphs that still use native schema `@transport`.

When serving Mesh v2 Compose output, drop temporary Yarn patches for `@graphql-mesh/fusion-runtime`, `@graphql-hive/gateway-runtime`, and `@graphql-mesh/transport-http-callback`, and use this Gateway release (or newer).
