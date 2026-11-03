---
'@graphql-tools/executor-http': minor
'@graphql-mesh/transport-http': patch
---

Add `deduplicateInflightRequestsPerContext` option to the HTTP executor

When `true` (default), inflight requests are deduplicated only within the same `context` object. When `false`, identical requests are deduplicated across different contexts within the same executor.

Hive Gateway's HTTP transport sets it to `false` so that identical subgraph requests coming from different clients are deduplicated.
