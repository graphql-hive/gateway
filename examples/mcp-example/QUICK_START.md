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
  plugins: () => [
    useMCP({
      name: 'my-api',
      path: '/mcp',
      tools: [
        {
          name: 'get_users',
          source: {
            type: 'inline',
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

- Documentation (WIP): https://docs.google.com/document/d/14FeFPz40QMMbNE2w-9OPzwOe8GcSEjJJQoKSKkm5xdY
- Examples and config reference: https://github.com/graphql-hive/gateway/blob/7356319c23b005c29a44efc06885e936fbcb8923/examples/mcp-example/README.md#diff-e382d6a0e278f4d8f7da4a3d96e106221517ecb1d9d141d7b9d15014f05569bb
