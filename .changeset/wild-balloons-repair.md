---
'@graphql-hive/logger-winston': major
---

**Winston Adapter**

Now you can integrate [Winston](https://github.com/winstonjs/winston) into Hive Gateway on Node.js

```ts
import { createLogger, format, transports } from 'winston'
import { createLoggerFromWinston } from '@graphql-hive/winston'

// Create a Winston logger
const winstonLogger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.Console()
    ]
})

export const gatewayConfig = defineConfig({
    // Create an adapter for Winston
    logging: createLoggerFromWinston(winstonLogger)
})
```
