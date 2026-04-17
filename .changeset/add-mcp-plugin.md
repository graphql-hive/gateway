---
'@graphql-hive/plugin-mcp': minor
---

New plugin that lets AI agents interact with your GraphQL API through [MCP](https://modelcontextprotocol.io/) (Model Context Protocol). Each GraphQL operation becomes a tool that agents can discover and call.

```sh
npm i @graphql-hive/plugin-mcp
```

```ts
import { defineConfig } from '@graphql-hive/gateway';
import { type MCPConfig, useMCP } from '@graphql-hive/plugin-mcp';

const mcp: MCPConfig = {
  name: 'my-api',
  path: '/mcp',
  tools: [
    {
      name: 'get_user',
      source: {
        type: 'inline',
        query: 'query GetUser($id: ID!) { user(id: $id) { name email } }',
      },
    },
  ],
};

export const gatewayConfig = defineConfig({
  plugins: (ctx) => [useMCP(ctx, mcp)],
});
```

Then start the gateway as usual. The MCP endpoint is available at `/mcp`.

Tools can also be auto-registered from `.graphql` files using `@mcpTool` directives:

```graphql
query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Current weather") {
  weather(location: $location) { temperature conditions }
}
```

**Features:**

- **Tool sources** - inline queries, named operations from files, `@mcpTool` directives, or a user-provided `loader` for fetching operations from any external source (CDN, object store, persisted-documents service)
- **Description providers** - dynamic tool/field descriptions via Langfuse or custom providers
- **Input transforms** - field aliases, defaults, hidden fields, `@mcpHeader` for injecting from HTTP headers
- **Output transforms** - `output.path` to extract nested data, `outputSchema` control
- **Hooks** - `preprocess` (validation gates, arg injection) and `postprocess` (format results)
- **Resources** - static docs (inline text or file) and parameterized resource templates with dynamic URI patterns

See the [README](https://github.com/graphql-hive/gateway/blob/main/packages/plugins/mcp/README.md) for full documentation, and [`examples/`](https://github.com/graphql-hive/gateway/tree/main/packages/plugins/mcp/examples) for runnable demos.
