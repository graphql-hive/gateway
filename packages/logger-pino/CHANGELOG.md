# @graphql-hive/logger-pino

## 1.0.2

### Patch Changes

- [#1245](https://github.com/graphql-hive/gateway/pull/1245) [`29f537f`](https://github.com/graphql-hive/gateway/commit/29f537f7dfcf17f3911efd5845d7af1e532d2e85) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/utils@^0.104.5` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.104.5) (from `^0.104.2`, in `dependencies`)

- [#1258](https://github.com/graphql-hive/gateway/pull/1258) [`3d24beb`](https://github.com/graphql-hive/gateway/commit/3d24beb7b15fd8109f86bbb3dfd514f6b8202741) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/types@^0.104.5` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.104.5) (from `^0.104.0`, in `dependencies`)

## 1.0.1

### Patch Changes

- [#1156](https://github.com/graphql-hive/gateway/pull/1156) [`fb74009`](https://github.com/graphql-hive/gateway/commit/fb740098652dba2e9107981d1f4e362143478451) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:

  - Updated dependency [`pino@^9.7.0` ↗︎](https://www.npmjs.com/package/pino/v/9.7.0) (from `^9.6.0`, in `peerDependencies`)

## 1.0.0

### Major Changes

- [#946](https://github.com/graphql-hive/gateway/pull/946) [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35) Thanks [@ardatan](https://github.com/ardatan)! - New Pino integration (also helpful for Fastify integration);

  ```ts
  import { defineConfig } from '@graphql-hive/gateway';
  import { createLoggerFromPino } from '@graphql-hive/logger-pino';
  import pino from 'pino';

  export const gatewayConfig = defineConfig({
    logging: createLoggerFromPino(pino({ level: 'info' })),
  });
  ```
