---
'@graphql-hive/gateway': patch
'@graphql-hive/gateway-runtime': patch
---

Fixes for better support of the plugin system in WebSockets;

- Ensure  `params: GraphQLParams` and `request: Request` exist in the context
- Invoke `onParams` and `onExecutionResult` hooks from plugins properly