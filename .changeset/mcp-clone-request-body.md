---
'@graphql-hive/plugin-mcp': patch
---

Fix MCP tool calls failing on Bun with GraphQL Yoga v5.24+

The JSON-RPC body is now read from a clone of the request, leaving the original body untouched for Yoga's request body size limit.
