---
'@graphql-hive/logger-pino': major
---

New Pino integration (also helpful for Fastify integration);

```ts
import { defineConfig } from '@graphql-hive/gateway';
import pino from 'pino';
import { createLoggerFromPino } from '@graphql-hive/logger-pino';

export const gatewayConfig = defineConfig({
   logging: createLoggerFromPino(pino({ level: 'info' })),
});
```
