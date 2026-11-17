---
'@graphql-hive/router-runtime': patch
---

Execute query plans of `@graphql-hive/router-query-planner` v0.0.53

### Fetches under `@include` and `@skip`

Query plans have no `Condition` nodes. The `@include`/`@skip` around a fetch and on its fields are in the optional `runIf` of the fetch, and of every alias of a `BatchFetch`. A fetch whose conditions don't hold is not sent, and a batch alias whose conditions don't hold sends no representations. A batch with every alias off is not sent at all.

A query plan without a node, when no fetch can ever run, responds with empty data instead of failing.

### Aliased required fields

A required field the planner fetched under an internal alias is read only from that alias. When it's missing, whatever the client selected under the field's name is not sent in its place.
