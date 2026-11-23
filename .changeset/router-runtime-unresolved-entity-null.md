---
'@graphql-hive/router-runtime': patch
---

Propagate the `null` of an unresolved entity to the nearest nullable parent

When the subgraph owning an entity can't resolve it and a non-nullable field of the entity was selected, the `null` now goes up to the nearest nullable parent, like with the default handler, instead of stopping at the field referencing the entity.

Closes #2772
