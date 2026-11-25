---
'@graphql-tools/executor-common': minor
'@graphql-tools/executor-http': patch
'@graphql-hive/gateway-runtime': patch
---

Subgraph results can stay raw response bytes until read

A request can ask for a raw response with `requestRawResponse`, and the HTTP executor then gives the body bytes of a successful JSON response, its `data`, `errors` and `extensions` parsed only when read. The consumers of a deduplicated inflight request each get their own raw result over the same bytes instead of a copy of the data, and `isSharedRawResponse` tells them apart. The subgraph error plugin extends the errors of a raw result once they're parsed.
