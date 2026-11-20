---
'@graphql-hive/router-runtime': patch
---

Execute query plans of `@graphql-hive/router-query-planner` v0.0.53

### Fetches under `@include` and `@skip`

Query plans have no `Condition` nodes. The `@include`/`@skip` around a fetch and on its fields are in the optional `runIf` of the fetch, and of every alias of a `BatchFetch`. A fetch whose conditions don't hold is not sent, and a batch alias whose conditions don't hold sends no representations. A batch with every alias off is not sent at all.

A query plan without a node, when no fetch can ever run, responds with empty data instead of failing.

### Aliased required fields

A required field the planner fetched under an internal alias is read only from that alias. When it's missing, whatever the client selected under the field's name is not sent in its place.

### Entities with a missing required field

An entity is left out of an entity call only when it has none of its keys in that subgraph. A required field it misses, like one whose subgraph returned `null` for the entity, is sent as `null`. An entity keyed by `@key(fields: "__typename")` alone is no longer dropped when its required field is missing.

An object inside a representation that misses a selected field is sent as `null`, and a list item with nothing to send keeps its place as `null`.

### Error paths

Error paths stop at the closest field the client asked for. A path into a field the gateway fetched for itself, like a `@requires` field or `_entities`, is cut there, and an error with no such field has no path.
