---
'@graphql-mesh/fusion-runtime': minor
'@graphql-hive/gateway-runtime': patch
'@graphql-mesh/transport-http-callback': patch
---

Upstream Mesh Compose join-transport runtime support (from Mesh #9847)

Hive Gateway now reads Mesh Compose output that rewrites schema `@transport` to `@join__directive(name: "transport")`, infers `kind: "connect"` from Connectors `@connect` / SCHEMA `@source`, accepts Mesh `@source` from the core `@link` URL (`https://specs.graphql-mesh.com/core/v0.1` and the older Mesh source `@link`), and asserts supported Mesh `@link` versions on `specs.graphql-mesh.com`.

`@graphql-hive/gateway-runtime` also passes Hive `log` into `readFileOrUrl` (keeping the legacy `logger` key for older `@graphql-mesh/utils`).

`@graphql-mesh/transport-http-callback` sets sync `DisposableSymbols.dispose` directly instead of `@graphql-mesh/utils` `makeDisposable` (removed on Mesh tip), matching the Mesh Yarn patches for 1.1.2 / 1.1.3.

### Migration

No config changes for existing supergraphs that still stamp native schema `@transport`.

After upgrading Mesh Compose to the join-transport final supergraph shape:

1. Drop any temporary Yarn resolution that patched `@graphql-mesh/fusion-runtime`, `@graphql-hive/gateway-runtime`, or `@graphql-mesh/transport-http-callback`.
2. Serve the new supergraph with this Gateway release (or newer). Bare Connectors subgraphs without `@transport` resolve as `kind: "connect"`.
3. Keep Mesh `@link` URLs on `https://specs.graphql-mesh.com/<name>/v0.1` (or the older `https://the-guild.dev/graphql/mesh/spec/...` core/source stamp). Unsupported `specs.graphql-mesh.com` versions fail at load time.
