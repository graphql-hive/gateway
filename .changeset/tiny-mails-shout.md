---
'@graphql-hive/router-runtime': patch
---

### Improve cache key calculation

The router-runtime package now uses a native hash mechanism, provided by the Rust runtime, instead of using the operationName for the cache key. This ensure a more robust caching.
