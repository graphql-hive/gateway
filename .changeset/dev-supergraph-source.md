---
'@graphql-hive/gateway-runtime': minor
'@graphql-hive/gateway': minor
---

Add a `dev` supergraph source that lets the gateway compose a supergraph directly from
local/introspected subgraphs (optionally via remote Hive registry composition) without running a
separate `hive dev` process.

Configure it via `supergraph: { type: 'dev', services: [...] }` in the config file. Each service
has a `name`, the `url` the gateway routes to, and an optional `source`: `federation` (default,
via the `_service { sdl }` field), `graphql` (standard introspection) or `file` (an SDL file given
in `schema`, Node.js only). The services are re-resolved on every polling interval and the
supergraph is recomposed only when a schema changed; composition is guarded by the optional
`circuitBreaker` option.

Remote composition takes `remote`, `registry`, `token` and `target` (`{ byId }` or
`{ bySelector: { organizationSlug, projectSlug, targetSlug } }`), with `--dev-remote`
(`DEV_REMOTE`), `--dev-registry` (`DEV_REGISTRY`), `--dev-registry-token`
(`DEV_REGISTRY_TOKEN`) and `--dev-target` (`DEV_TARGET`, slug path or target UUID) CLI/env
overrides for the `supergraph` command. `DEV_REMOTE` accepts truthy/falsy values: `1`, `true`,
`yes` or `on` enable remote composition, while `0`, `false`, `off` or an empty value disable it
and override `remote: true` from the config file. `registry` defaults to
`https://app.graphql-hive.com/graphql` (Hive Cloud) and only needs to be set for self-hosted Hive.
The services themselves can also be defined entirely from the CLI using `--dev-service <name>=<url>`
(repeated once per service), with `--dev-service-source <name>=federation|graphql|file` and
`--dev-service-schema <name>=<path>` as optional per-service overlays keyed by the same service
name; when used, these take precedence over any `services` configured in the config file.
