---
'@graphql-hive/plugin-mcp': minor
---

Add `customMethods` and `customCapabilities` to the MCP plugin configuration. Custom JSON-RPC methods are dispatched on the MCP endpoint alongside the built-ins and receive a context with `executeGraphQL` (full server pipeline, request headers forwarded), `getSchema`, and transport details. Throw the new `MCPMethodError` from a handler to produce a JSON-RPC error response with a specific code. Custom capability entries are merged into the `initialize` response. Unknown `notifications/*` methods are now silently dropped instead of receiving a "Method not found" error response, per the JSON-RPC 2.0 specification.
