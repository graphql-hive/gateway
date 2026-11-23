---
'@graphql-tools/executor-http': patch
---

Merge executor headers case-insensitively so custom `Accept` and `Content-Type` values replace defaults instead of producing duplicate headers.
