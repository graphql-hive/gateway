---
'@graphql-tools/executor-http': patch
---

Less CPU per subgraph request

The consumers of a shared inflight request get the data with a JSON deep copy instead of `structuredClone`, and the last one gets the original. The variables are checked for uploads before they're cloned to extract them, and the combined signal of a request is released once a non-streaming result is in, instead of leaving a listener behind until GC.
