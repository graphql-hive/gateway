---
'@graphql-hive/gateway-runtime': patch
---

Introduce `deduplicateHeaders` option for `propagateHeaders` configuration to control header handling behavior when multiple subgraphs return the same header

When `deduplicateHeaders` is enabled (set to `true`), only the last value from subgraphs will be set for each header. When disabled (default `false`), all values are appended.

The `set-cookie` header is always appended regardless of this setting, as per HTTP standards.

```ts
import { defineConfig } from '@graphql-hive/gateway'
export const gatewayConfig = defineConfig({
  propagateHeaders: {
    deduplicateHeaders: true, // default: false
    fromSubgraphsToClient({ response }) {
      // ...
    }
  }
})
```
