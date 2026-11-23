---
'@graphql-hive/plugin-aws-sigv4': patch
---

Validate incoming AWS SigV4 signatures for GraphQL operations over WebSockets

WebSocket operations do not go through the request parsing phase, so the plugin validates the WebSocket upgrade request before executing each operation. Unsigned WebSocket clients are rejected the same way unsigned HTTP requests are.
