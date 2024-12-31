---
'@graphql-tools/federation': patch
---

In case of shared root field on Mutation, it was batched incorrectly across subgraphs. But instead only one mutation should be called as mutations should not be parallel
