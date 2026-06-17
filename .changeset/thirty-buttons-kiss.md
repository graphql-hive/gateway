---
'@graphql-hive/gateway': minor
---

Rate limiting now supports per-field identity via `identifier` template strings and per-field `identifyFn` with argument access

### `identifier` template string

Use `{args.argName}` or `{context.propName}` dot-path interpolation to build the rate limit key inline, without writing a function:

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  rateLimiting: [
    {
      type: 'Query',
      field: 'getProduct',
      max: 10,
      ttl: 60000,
      identifier: '{args.id}',
    },
    {
      type: 'Query',
      field: 'search',
      max: 30,
      ttl: 60000,
      identifier: '{context.ip}',
    },
  ],
});
```

### Per-field `identifyFn` with argument values

Override the identity function for a single field and receive the resolved argument values as a second parameter, useful for rate limiting unauthenticated requests by argument value:

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  rateLimiting: [
    {
      type: 'Query',
      field: 'getProduct', // getProduct(id: ID!): Product!
      max: 10,
      ttl: 60000,
      identifyFn: (ctx, args) => String(args.id),
    },
  ],
});
```
