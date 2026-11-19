---
'@graphql-hive/gateway-runtime': major
'@graphql-hive/gateway': major
---

Do not trust the incoming `x-request-id` header by default

The request ID is taken from the ID the server framework already assigned to the request (for example Fastify's `request.id`), otherwise a new one is generated. The incoming `x-request-id` header is ignored, so clients reaching the gateway directly cannot pick request IDs that collide with other requests in the logs.

If the gateway is reachable only through a proxy or another gateway that sets the header itself, trust the header:

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  requestId: {
    trustHeader: true,
  },
});
```
