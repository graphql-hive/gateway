---
'@graphql-mesh/transport-common': patch
'@graphql-tools/executor-http': patch
'@graphql-mesh/fusion-runtime': patch
'@graphql-hive/gateway-runtime': patch
---

Fix the combination of `upstreamRetry` and `upstreamTimeout` together

When you use `upstreamRetry` and `upstreamTimeout` together, the `upstreamRetry` wasn't applied properly when the request is timed out with `upstreamTimeout`.
