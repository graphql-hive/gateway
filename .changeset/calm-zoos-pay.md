---
'@graphql-tools/batch-execute': patch
---

Inherit `operationName`, `operationType`, `context`, `info`, and `subgraphName` from any available request in the batch.
If `operationName` is not defined, it will be inherited from the operation itself, if it has a name.
