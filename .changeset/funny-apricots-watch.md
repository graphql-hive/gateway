---
'@graphql-hive/gateway': patch
---

`host` header was removed from the fallback chain of default rate limiting identifier as it identifies the server, not the caller
