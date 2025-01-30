---
'@graphql-hive/gateway': patch
---

Use the same logging instance across different components whenever possible

For example if the log level is set in the configuration, change it immediately for the cache storages etc.
