---
'@graphql-tools/batch-execute': patch
---

Spread sync errors into an array with the same size of the requests to satisfy underlying DataLoader implementation to throw the error correctly
