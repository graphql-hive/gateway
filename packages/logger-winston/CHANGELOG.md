# @graphql-hive/logger-winston

## 1.0.0

### Major Changes

- [#622](https://github.com/graphql-hive/gateway/pull/622) [`16f9bd9`](https://github.com/graphql-hive/gateway/commit/16f9bd981d5779c585c00bf79e790c94b00326f1) Thanks [@ardatan](https://github.com/ardatan)! - **Winston Adapter**

  Now you can integrate [Winston](https://github.com/winstonjs/winston) into Hive Gateway on Node.js

  ```ts
  import { defineConfig } from '@graphql-hive/gateway';
  import { createLoggerFromWinston } from '@graphql-hive/winston';
  import { createLogger, format, transports } from 'winston';

  // Create a Winston logger
  const winstonLogger = createLogger({
    level: 'info',
    format: format.combine(format.timestamp(), format.json()),
    transports: [new transports.Console()],
  });

  export const gatewayConfig = defineConfig({
    // Create an adapter for Winston
    logging: createLoggerFromWinston(winstonLogger),
  });
  ```
