---
'@graphql-tools/delegate': patch
---

Avoid stack overflow when resolving deferred fields through `wrapSchema` over a stitched schema

Without `defer: true`, a deferred field owned by another inner subschema used to call `defaultMergedResolver` on the nested stitched schema with the same parent and recurse. Re-fetch via the nested merged-type resolver for the field owner instead.
