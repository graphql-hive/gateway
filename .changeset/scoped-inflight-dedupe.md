---
'@graphql-tools/executor-http': patch
---

Deduplicate inflight requests only within the same executor and the same `context`

The `fetch` implementation receives the request `context` and may handle each request differently, so identical requests with different contexts or from different executors are no longer deduplicated together.
