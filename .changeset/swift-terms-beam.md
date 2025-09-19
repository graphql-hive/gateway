---
'@graphql-hive/gateway-runtime': patch
---

Make `onFetch`'s `context` referentially stable, and do not recreate the context object, so it becomes the same object referentially in the execution pipeline
