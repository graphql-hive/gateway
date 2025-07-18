---
'@graphql-mesh/fusion-runtime': minor
---

Breaking Change: Removed `subgraphNameByExecutionRequest` weak map. Subgraph name is now stored in the execution request itself.

```diff
- const subgraphName = subgraphNameByExecutionRequest.get(executionRequest)
+ const subgraphName = executionRequest.subgraphName
```
