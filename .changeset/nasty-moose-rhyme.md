---
'@graphql-hive/plugin-mcp': minor
---

Operations loader is now per-request instead of startup-time

Previously `load()` was called once at startup and `onUpdate()` was called to push live changes. Now `load()` is called on every MCP request and `onUpdate` has been removed entirely.

Before:

```typescript
const loader: MCPOperationsLoader = {
  async load() {
    return fetchOperations();
  },
  onUpdate(callback) {
    const interval = setInterval(async () => {
      callback(await fetchOperations());
    }, 30_000);
    return () => clearInterval(interval);
  },
};
```

After:

```typescript
const loader: MCPOperationsLoader = {
  async load({ request, serverContext }) {
    return fetchOperations();
  },
};
```

`load()` now receives `{ request, serverContext }` so the operations source can vary per request (e.g. driven by a request header for multi-tenant setups).

Results are cached by the returned string: if `load()` returns the same source as a previous call the cached `ToolRegistry` is reused without rebuilding. The cache is cleared whenever the schema changes.

If `load()` throws, the plugin logs the error and falls back to the static tool registry for that request.
