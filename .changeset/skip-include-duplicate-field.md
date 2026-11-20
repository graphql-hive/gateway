---
'@graphql-tools/delegate': patch
---

Keep the unconditional copy of a field that is also selected with `@skip` or `@include`, so it is no longer dropped from the subschema request and returned as `null`.
