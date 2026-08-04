---
'@graphql-hive/plugin-opentelemetry': patch
'@graphql-hive/gateway-runtime': patch
---

Upgrade `@graphql-hive/core` to 0.22.1.

This version improves error handling inside the usage collector to prevent unhandled exceptions from being raised that can kill the application.