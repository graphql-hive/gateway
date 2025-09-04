---
"@graphql-hive/gateway": major
---

`useDeduplicateRequest()` plugin has been removed in favour of the built-in inflight request deduplication

To migrate, simply remove the plugin from your configuration and you're good to go!

```diff
import {
  defineConfig,
- useDeduplicateRequest,
} from '@graphql-hive/gateway'

export const gatewayConfig = defineConfig({
- plugins: ctx => [useDeduplicateRequest(ctx)]
})
```

If you still want to use the deprecated plugin, you need to install it separately and use it as before:

```sh
npm i @graphql-hive/plugin-deduplicate-request
```

```diff
import {
  defineConfig,
  HTTPTransportOptions,
- useDeduplicateRequest,
} from '@graphql-hive/gateway'
+ import { useDeduplicateRequest } from '@graphql-hive/plugin-deduplicate-request'

export const gatewayConfig = defineConfig({
  transportEntries: {
    '*.http': {
      options: {
        // disable the built in deduplication
        deduplicateInflightRequests: false,
      } as HTTPTransportOptions,
    },
  },
  plugins: ctx => [useDeduplicateRequest(ctx)]
})
```
