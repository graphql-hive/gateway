---
'@graphql-mesh/fusion-runtime': patch
'@graphql-hive/gateway-runtime': patch
---

When the schema is reloaded during a query execution, retry the request instead of throwing a reload event error
