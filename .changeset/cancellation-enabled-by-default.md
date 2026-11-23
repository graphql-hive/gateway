---
'@graphql-hive/gateway-runtime': major
'@graphql-hive/gateway': major
---

Enable `executionCancellation` and `upstreamCancellation` by default

When the client disconnects or aborts the request, the gateway now stops executing the operation and aborts the in-flight upstream subgraph requests by default.

To restore the previous behaviour, explicitly disable them:

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  executionCancellation: false,
  upstreamCancellation: false,
});
```
