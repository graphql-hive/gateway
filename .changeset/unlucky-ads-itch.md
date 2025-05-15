---
'@graphql-tools/delegate': patch
'@graphql-tools/stitch': patch
---

Optimize `@provides` handling, so do not plan new queries if it is already provided by the parent subgraph
