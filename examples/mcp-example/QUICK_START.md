# MCP Plugin Quick Start (Alpha)

## Install

```bash
npm install @graphql-hive/gateway@2.5.7-alpha-ba362993ab9f3a4e1070872c37859fef2ca1940f 
npm install @graphql-hive/plugin-mcp@0.1.0-alpha-c26e9ac6169a06e8939e95fa08a1f594e348e741
```

## Configure

Add `useMCP` to your gateway config:

```typescript
import { defineConfig } from '@graphql-hive/gateway'
import { useMCP } from '@graphql-hive/plugin-mcp'

export const gatewayConfig = defineConfig({
  // your existing supergraph/proxy config
  plugins: (ctx) => [
    useMCP(ctx, {
      name: 'my-api',
      path: '/mcp',
      tools: [
        {
          name: 'get_users',
          source: {
            type: 'inline' as const,
            query: `query GetUsers($limit: Int) {
              users(limit: $limit) { id name email }
            }`,
          },
        },
      ],
    }),
  ],
})
```

## Test

```bash
# List tools
curl http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool
curl http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_users","arguments":{"limit":5}}}'
```

## Resources

- Examples and config reference: https://github.com/graphql-hive/gateway/blob/main/examples/mcp-example/README.md
