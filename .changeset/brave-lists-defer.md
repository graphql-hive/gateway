---
'@graphql-tools/delegate': patch
---

Deliver forwarded `@defer` patches for every item of a nested list

When a subschema has `defer: true`, deferred fields inside list items were resolved as `null`: `IncrementalReceiver` did not merge patches into existing list items, and when the subgraph sent several patches in one chunk, every re-emitted patch carried the chunk's `hasNext: false`, so only the first one was applied.
