---
'@graphql-mesh/fusion-runtime': minor
---

Extract subgraph execution batching logic outside, so batching is handled by the Gateway not Stitching

**BREAKING**; `UnifiedGraphHandlerOpts` no longer takes `batch` option, it is handled by the runtime itself
