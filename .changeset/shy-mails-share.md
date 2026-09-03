---
'@graphql-tools/federation': patch
'@graphql-tools/delegate': patch
'@graphql-tools/stitch': patch
---

Flush deferred merged fields without blocking the initial payload

Deferred fields on merged entity types are now delegated when their deferred resolvers run instead of being included in the initial delegation plan. This allows the initial payload to be delivered before slower merged subgraph fields resolve.
