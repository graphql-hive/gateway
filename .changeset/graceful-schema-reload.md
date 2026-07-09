---
'@graphql-hive/gateway-runtime': minor
'@graphql-mesh/fusion-runtime': minor
---

Add opt-in graceful supergraph reload ("generation overlap").

By default, when the supergraph reloads, the previous generation (executor +
subgraph transports) is disposed immediately, aborting any in-flight operation
on it with a `SCHEMA_RELOAD` / 503 error (queries are retried on the new schema;
mutations are not).

With the new `gracefulSchemaReload` config the previous generation is kept alive
and only new requests are routed to the new one, so in-flight queries and
mutations finish on the schema they were admitted under. Operations are
reference-counted per generation for their whole lifetime (across all subgraph
hops, and until `@defer`/`@stream` streams end). A superseded generation is
disposed once idle, or force-disposed after `drainTimeout`; `maxConcurrentGenerations`
caps how many generations may overlap. Subscriptions are not pinned: one on a
superseded generation ends with `SCHEMA_RELOAD` when that generation is
disposed — immediately on reload when nothing is draining, otherwise once the
last in-flight operation finishes (at the latest after `drainTimeout`) — and
the client then reconnects against the new schema. Disabled by default.

```ts
export const gatewayConfig = defineConfig({
  gracefulSchemaReload: { drainTimeout: 10_000 }, // ms; default off
});
```
