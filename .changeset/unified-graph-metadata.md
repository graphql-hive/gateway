---
'@graphql-mesh/fusion-runtime': minor
---

Unified graph manager supports metadata loaded together with the unified graph

`getUnifiedGraph` can now return `{ graph, metadata }` in addition to the unified graph itself. The metadata is kept with the last successfully loaded unified graph and passed to `onUnifiedGraphChange(schema, metadata)`. When the loaded unified graph did not change but its metadata did (shallow comparison), `onUnifiedGraphMetadataChange(schema, metadata)` is called.
