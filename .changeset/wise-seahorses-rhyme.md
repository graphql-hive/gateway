---
'@graphql-tools/executor-http': minor
'@graphql-mesh/transport-http': patch
---

Automatic Persisted Queries support for upstream requests

For HTTP Executor;
```ts
buildHTTPExecutor({
    // ...
    apq: true,
})
```

For Gateway Configuration;
```ts
export const gatewayConfig = defineConfig({
    transportEntries: {
        '*': {
            options: {
                apq: true
            }
        }
    },
})
```
