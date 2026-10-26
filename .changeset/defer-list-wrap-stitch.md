---
'@graphql-tools/delegate': patch
---

Deliver forwarded `@defer` patches for nested list items and avoid recursion through `wrapSchema` over a stitched schema

When a subschema has `defer: true`, deferred fields inside list items were resolved as `null`: `IncrementalReceiver` did not merge patches into existing list items (including nested lists), and when the subgraph sent several patches in one chunk, every re-emitted patch carried the chunk's `hasNext: false`, so only the first one was applied.

Without `defer: true`, a deferred field owned by another inner subschema under `wrapSchema` over a stitched schema called `defaultMergedResolver` on the nested schema with the same parent and recursed. Re-fetch via the nested merged-type resolver for the field owner instead.
