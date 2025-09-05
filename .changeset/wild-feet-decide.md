---
'@graphql-hive/gateway': patch
---

maxDepth and maxTokens disabled by default

Other gateways out there don't have these defaults and they might be too limiting, let's leave it for the users to decide. No new breaking change because it's too early for significant adoption.
