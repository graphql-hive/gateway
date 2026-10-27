---
'@graphql-hive/router-runtime': patch
---

Null out unresolved entities selected through fragments, report non-nullable field errors and keep list indices in entity error paths

When the subgraph owning an entity could not resolve it (`__resolveReference` returned `null` or threw) and its fields were selected through an inline or named fragment, the entity was returned as `{}` or `{ "__typename": ... }` instead of `null`. A missing non-nullable field inside a fragment now nulls the parent, the same as without a fragment.

A missing non-nullable field now also reports a `Cannot return null for non-nullable field` error, unless an upstream error already covers that path.

When the subgraph reports a failed `_entities` field without an entity index, the error is now relocated to every affected entity path including the list indices, instead of a path without them.
