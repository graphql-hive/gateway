---
'@graphql-hive/gateway-runtime': minor
'@graphql-hive/gateway': minor
---

Add a `dev` supergraph source backed by `@graphql-hive/core`'s `createDevFetcher`, letting the
gateway compose a supergraph directly from local/introspected subgraphs (optionally via remote
Hive registry composition) without running a separate `hive dev` process.

Configure it via `supergraph: { type: 'dev', services: [...] }` in the config file, with
`--dev-remote`, `--dev-registry`, `--dev-registry-token` and `--dev-target` CLI/env overrides for
the `supergraph` command. The services themselves can also be defined entirely from the CLI using
`--dev-service-url <name>=<url>` (repeated once per service), with `--dev-service-source
<name>=federation|graphql|file` and `--dev-service-schema <name>=<path>` as optional per-service
overlays keyed by the same service name; when used, these take precedence over any `services`
configured in the config file.
