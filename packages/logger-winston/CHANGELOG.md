# @graphql-hive/logger-winston

## 1.0.5
### Patch Changes



- [#1408](https://github.com/graphql-hive/gateway/pull/1408) [`5aefad2`](https://github.com/graphql-hive/gateway/commit/5aefad2ac4abe40fd1cb141218bd2679b3e0047d) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  
  - Updated dependency [`@graphql-mesh/types@^0.104.8` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.104.8) (from `^0.104.7`, in `dependencies`)

## 1.0.4

### Patch Changes

- [#1383](https://github.com/graphql-hive/gateway/pull/1383) [`a832e7b`](https://github.com/graphql-hive/gateway/commit/a832e7bf9a8f92c48fb9df8ca1bff5a008dcf420) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/types@^0.104.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.104.7) (from `^0.104.5`, in `dependencies`)

## 1.0.3

### Patch Changes

- [#1258](https://github.com/graphql-hive/gateway/pull/1258) [`3d24beb`](https://github.com/graphql-hive/gateway/commit/3d24beb7b15fd8109f86bbb3dfd514f6b8202741) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/types@^0.104.5` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.104.5) (from `^0.104.0`, in `dependencies`)

## 1.0.2

### Patch Changes

- [#727](https://github.com/graphql-hive/gateway/pull/727) [`c54a080`](https://github.com/graphql-hive/gateway/commit/c54a080b8b9c477ed55dd7c23fc8fcae9139bec8) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@whatwg-node/disposablestack@^0.0.6` ↗︎](https://www.npmjs.com/package/@whatwg-node/disposablestack/v/0.0.6) (from `^0.0.5`, in `dependencies`)

- [#775](https://github.com/graphql-hive/gateway/pull/775) [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/types@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.104.0) (from `^0.103.18`, in `dependencies`)

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
