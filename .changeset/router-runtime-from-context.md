---
'@graphql-hive/router-runtime': minor
---

Support Federation `@context` and `@fromContext`

Contextual arguments are resolved for every entity from the ancestor setting the context and sent to the subgraph as variables. Entities whose ancestors hold different values are grouped by those values, and all groups are sent in one request using an aliased `_entities` field per group. Contextual arguments that are non-null are fetched with one request per group instead.

Requires `@graphql-hive/router-query-planner` v0.0.50 or later, which plans `@fromContext` fields.
