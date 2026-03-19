---
'@graphql-hive/gateway-runtime': patch
---

When a plugin like Defer/Stream plugin updates the schema, the gateway considers the original schema as a new schema then tries to overwrite it.
After the overwrite, the external plugin tries to update it again on each request. So this causes extra schema changes on each request which causes extra resource consumption.
