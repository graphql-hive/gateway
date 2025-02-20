# @graphql-hive/logger-winston

## 1.0.1

### Patch Changes

- [#696](https://github.com/graphql-hive/gateway/pull/696) [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/types@^0.103.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.18) (from `^0.103.6`, in `dependencies`)

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
