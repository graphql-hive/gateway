---
'@graphql-tools/delegate': patch
---

Fix redundant type merging calls when subschemas have no explicit name.

The fallback name-based matching in `resolveExternalValue` (introduced in #1557) incorrectly matched unrelated subschemas when neither had an explicit `name` set, because `undefined === undefined` evaluated to `true`. This caused type merging to trigger even when fetching a type directly from its source subschema, resulting in a redundant second call.
