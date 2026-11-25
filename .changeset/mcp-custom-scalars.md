---
'@graphql-hive/plugin-mcp': minor
---

Add `customScalars` option to map custom GraphQL scalar names to JSON Schema in generated `inputSchema` and `outputSchema`. Previously every custom scalar resolved to `{ "type": "object" }`, which hosts that validate `structuredContent` (e.g. Claude Desktop) reject for scalars serialised as strings.
