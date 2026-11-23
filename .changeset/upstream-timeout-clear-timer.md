---
'@graphql-hive/gateway-runtime': patch
---

Clear the upstream timeout timer as soon as a non-streaming subgraph request settles

The upstream timeout signal stays referenced only for as long as the subgraph request is in flight, so the request and everything around it can be garbage collected right after it completes instead of being retained until the timeout expires.
