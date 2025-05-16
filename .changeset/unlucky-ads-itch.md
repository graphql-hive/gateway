---
'@graphql-tools/delegate': patch
'@graphql-tools/federation': patch
'@graphql-tools/stitch': patch
---

Optimizes `@provides` handling by avoiding the generation of new query plans when a parent subgraph already supplies the requested fields.  
- Refactors and inlines `subtractSelectionSets` to compute leftover selections.  
- Threads a `providedSelectionNode` through planning to subtract out provided fields early.  
- Updates stitching and federation logic to conditionally skip planning when selections are already available.
