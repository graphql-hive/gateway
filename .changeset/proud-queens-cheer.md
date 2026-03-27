---
'@graphql-hive/gateway-runtime': minor
---

# Gateway-level Inflight Request Deduplication

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  inboundInflightRequestDeduplication: true,
});
```

When enabled, if multiple identical requests are received by the gateway while the first one is still being processed,
only the first request will be executed and the rest will wait for its result,
which will then be shared among all identical requests.

This can be useful to reduce the load on the gateway and the subgraphs in case of high traffic and identical requests.

By default it includes;
- HTTP Request Method (e.g. GET, POST)
- Request URL
- Selected Request Headers (e.g. Authorization, Client-Name, etc...)
- GraphQL Operation AST
- GraphQL Operation Name
- GraphQL Operation Variables

By default it takes all headers into account, but you can provide a list of headers to include or exclude from the deduplication key calculation.

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  inboundInflightRequestDeduplication: {
    // Only include the "authorization" header in the deduplication key calculation
    shouldIncludeHeader: headerName => headerName === 'authorization'
  },
});
```