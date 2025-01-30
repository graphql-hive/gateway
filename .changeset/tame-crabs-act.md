---
'@graphql-hive/gateway': minor
---

Improve `cache` configuration signature. 

The `cache` configuration key now allow you to pass a custom factory function to get the cache instance: 

```ts
import { defineConfig } from '@graphql-hive/gateway'
 
export const gatewayConfig = defineConfig({
  // ...
  cache: (ctx) => {
    
  } 
})
```
