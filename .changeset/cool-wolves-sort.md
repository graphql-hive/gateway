---
'@graphql-mesh/fusion-runtime': minor
'@graphql-tools/federation': minor
'@graphql-tools/delegate': minor
'@graphql-hive/gateway-runtime': minor
'@graphql-tools/stitch': minor
---

Progressive Override for Safer Field Migrations

Introduces Progressive Override, allowing you to safely migrate fields between subgraphs using the `@override` directive with a label. Control the rollout using custom logic in the gateway (e.g., percentage, headers) or the built-in percent(x) label for gradual, incremental traffic migration.

Detailed documentation can be found [here](https://the-guild.dev/graphql/hive/docs/gateway/other-features/progressive-override).
