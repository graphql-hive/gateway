---
'@graphql-mesh/fusion-runtime': patch
'@graphql-hive/gateway': patch
'@graphql-hive/gateway-runtime': patch
---

`onError` and `onEnd` callbacks from `onSubgraphExecute` are invoked only once regardless of how many times throw/return was called on the iterator
