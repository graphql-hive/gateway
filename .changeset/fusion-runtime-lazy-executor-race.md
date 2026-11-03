---
'@graphql-mesh/fusion-runtime': patch
---

Create a single transport executor per subgraph when concurrent requests arrive before the transport is loaded

Concurrent first requests to a subgraph share the same pending transport executor so that features scoped to the executor, like inflight request deduplication, apply to them as well.
