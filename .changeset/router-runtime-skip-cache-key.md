---
'@graphql-hive/router-runtime': patch
---

Skip computing the query plan cache key on in-memory plan cache hits when the supergraph has no progressive override

The native `computeCacheKey` call scales with the size of the query and was running on every request, even when the plan for the document was already cached.
