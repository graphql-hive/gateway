---
'@graphql-tools/stitch': patch
---

Keep fields of named fragments spread on an interface when fetching the concrete type from the implementing subgraph

For example, `node { ...NodeFields }` with `fragment NodeFields on Node { ... on Leaf { extra } }` now fetches `extra` instead of returning `null` for it.

Closes #2463
