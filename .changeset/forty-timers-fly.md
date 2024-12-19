---
'@graphql-mesh/fusion-runtime': patch
'@graphql-hive/gateway': patch
'@graphql-hive/gateway-runtime': patch
---

Fix the bug on setting the default polling interval to 10 seconds
So by default, the gateway will poll the schema every 10 seconds, and update the schema if it has changed.

This PR also contains improvements on logging about polling