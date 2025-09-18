---
'@graphql-hive/gateway': patch
---

Support nested imports of package.json#exports definitions in Docker

```ts
import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';
import { trace } from '@graphql-hive/gateway/opentelemetry/api'; // ✅
import { openTelemetrySetup } from '@graphql-hive/gateway/opentelemetry/setup'; // ✅
```
