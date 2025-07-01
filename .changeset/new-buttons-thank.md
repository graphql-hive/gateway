---
'@graphql-hive/gateway': major
---

Disable forking even if NODE_ENV=production

Forking workers for concurrent processing is a delicate process and if not done carefully can lead to performance degradations. It should be configured with careful consideration by advanced users.
