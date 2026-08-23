---
'@graphql-hive/gateway': minor
---

Add a `keyPrefix` cache option, supported by all built-in cache backends (`redis`,
`cfw-kv`, `upstash-redis`, `localforage`).

When set, every key used for `get`/`set`/`delete` operations is namespaced with this prefix, regardless of the configured backend. Useful for
sharing a single cache instance (e.g. Redis) across multiple gateways or environments.

```ts
export const gatewayConfig = defineConfig({
  cache: {
    type: 'redis',
    host: 'localhost',
    port: 6379,
    keyPrefix: 'my-gateway:',
  },
});
```
