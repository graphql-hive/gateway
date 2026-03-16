# @graphql-hive/logger

## 1.1.0
### Minor Changes



- [#1942](https://github.com/graphql-hive/gateway/pull/1942) [`c75fd0a`](https://github.com/graphql-hive/gateway/commit/c75fd0a64730ab07a3a7115748841025e312f335) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Add `redact` option to `Logger` for redacting sensitive data from log output
  
  Supports path arrays, custom censor strings/functions, wildcard paths, and key removal.
  
  ### Examples
  
  #### Array of paths
  
  ```ts
  import { Logger } from '@graphql-hive/logger';
  
  const logger = new Logger({
    redact: ['password', 'headers.authorization', 'users[*].secret'],
  });
  
  logger.info({
    password: 'super-secret',
    headers: { authorization: 'Bearer token', host: 'example.com' },
    users: [{ secret: 'hidden', name: 'alice' }],
  });
  // attrs: {
  //   password: '[Redacted]',
  //   headers: { authorization: '[Redacted]', host: 'example.com' },
  //   users: [{ secret: '[Redacted]', name: 'alice' }],
  // }
  ```
  
  #### Custom censor string
  
  ```ts
  import { Logger } from '@graphql-hive/logger';
  
  const logger = new Logger({
    redact: {
      paths: ['password', 'headers.authorization'],
      censor: '**REDACTED**',
    },
  });
  
  logger.info({
    password: 'super-secret',
    headers: { authorization: 'Bearer token', host: 'example.com' },
  });
  // attrs: {
  //   password: '**REDACTED**',
  //   headers: { authorization: '**REDACTED**', host: 'example.com' },
  // }
  ```
  
  #### Censor function
  
  ```ts
  import { Logger } from '@graphql-hive/logger';
  
  const logger = new Logger({
    redact: {
      paths: ['password'],
      censor: (value, path) => `[${path.join('.')}=${String(value).length} chars]`,
    },
  });
  
  logger.info({ password: 'super-secret' });
  // attrs: { password: '[password=12 chars]' }
  ```
  
  #### Key removal
  
  Note that for performance reasons, we set the attribute value to `undefined` instead of completely deleting it. If you're using any of our default writers, those values wont show in the output anyways because the JSON serialiser handles `undefined` by omitting it.
  
  ```ts
  import { Logger } from '@graphql-hive/logger';
  
  const logger = new Logger({
    redact: {
      paths: ['password', 'headers.authorization'],
      remove: true,
    },
  });
  
  logger.info({
    password: 'super-secret',
    headers: { authorization: 'Bearer token', host: 'example.com' },
  });
  // attrs: { password: undefined, headers: { authorization: undefined, host: 'example.com' } }
  ```

## 1.0.10
### Patch Changes



- [#1863](https://github.com/graphql-hive/gateway/pull/1863) [`f321cbd`](https://github.com/graphql-hive/gateway/commit/f321cbdf87bc68bbf6770bec963c86e2a35b50bf) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`@logtape/logtape@^1.2.0 || ^2.0.0` ↗︎](https://www.npmjs.com/package/@logtape/logtape/v/1.2.0) (from `^1.2.0`, in `peerDependencies`)

## 1.0.9
### Patch Changes



- [#1691](https://github.com/graphql-hive/gateway/pull/1691) [`7ecaf7e`](https://github.com/graphql-hive/gateway/commit/7ecaf7e8f658c4e4c1a91d1e8db3c1a8ceca51cb) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`@logtape/logtape@^1.2.0` ↗︎](https://www.npmjs.com/package/@logtape/logtape/v/1.2.0) (from `^1.1.2`, in `peerDependencies`)

## 1.0.8
### Patch Changes



- [#1583](https://github.com/graphql-hive/gateway/pull/1583) [`1f58197`](https://github.com/graphql-hive/gateway/commit/1f58197a60882c79430e59638b9396071137a221) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`pino@^9.13.0 || ^10.0.0` ↗︎](https://www.npmjs.com/package/pino/v/9.13.0) (from `^9.13.0`, in `peerDependencies`)


- [#1608](https://github.com/graphql-hive/gateway/pull/1608) [`9c789fb`](https://github.com/graphql-hive/gateway/commit/9c789fb11f6de80e781ff056cb5b98c548938bea) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  
  - Updated dependency [`@logtape/logtape@^1.1.2` ↗︎](https://www.npmjs.com/package/@logtape/logtape/v/1.1.2) (from `^1.1.1`, in `peerDependencies`)

## 1.0.7
### Patch Changes



- [#1623](https://github.com/graphql-hive/gateway/pull/1623) [`b0cf7bb`](https://github.com/graphql-hive/gateway/commit/b0cf7bbb3ec1c1c1d18e7b064b2d9d7d2f8c9a2e) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`@logtape/logtape@^1.1.2` ↗︎](https://www.npmjs.com/package/@logtape/logtape/v/1.1.2) (from `^1.1.1`, in `peerDependencies`)

## 1.0.6
### Patch Changes



- [#1570](https://github.com/graphql-hive/gateway/pull/1570) [`883cd5a`](https://github.com/graphql-hive/gateway/commit/883cd5af9bc9badd0adc5596eb6a8cad741a3cb4) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`pino@^9.12.0` ↗︎](https://www.npmjs.com/package/pino/v/9.12.0) (from `^9.11.0`, in `peerDependencies`)


- [#1578](https://github.com/graphql-hive/gateway/pull/1578) [`91a848b`](https://github.com/graphql-hive/gateway/commit/91a848bf2db0b65f2751aaf0b2ebea9ae580e66d) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`pino@^9.13.0` ↗︎](https://www.npmjs.com/package/pino/v/9.13.0) (from `^9.12.0`, in `peerDependencies`)

## 1.0.5
### Patch Changes



- [#1541](https://github.com/graphql-hive/gateway/pull/1541) [`5e511ca`](https://github.com/graphql-hive/gateway/commit/5e511ca9cc555577936bba942c8b3ff0796b015e) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`pino@^9.11.0` ↗︎](https://www.npmjs.com/package/pino/v/9.11.0) (from `^9.10.0`, in `peerDependencies`)

## 1.0.4
### Patch Changes



- [#1523](https://github.com/graphql-hive/gateway/pull/1523) [`bb2621c`](https://github.com/graphql-hive/gateway/commit/bb2621ce85c42ccbc97c6ca128f959bcb2bb6475) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`@logtape/logtape@^1.1.1` ↗︎](https://www.npmjs.com/package/@logtape/logtape/v/1.1.1) (from `^1.1.0`, in `peerDependencies`)
  - Updated dependency [`pino@^9.10.0` ↗︎](https://www.npmjs.com/package/pino/v/9.10.0) (from `^9.9.5`, in `peerDependencies`)

## 1.0.3
### Patch Changes



- [#1484](https://github.com/graphql-hive/gateway/pull/1484) [`950ebd1`](https://github.com/graphql-hive/gateway/commit/950ebd1d1686846b59b555695c1738e25fd3268e) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`@logtape/logtape@^1.0.5` ↗︎](https://www.npmjs.com/package/@logtape/logtape/v/1.0.5) (from `^1.0.4`, in `peerDependencies`)
  - Updated dependency [`pino@^9.9.5` ↗︎](https://www.npmjs.com/package/pino/v/9.9.5) (from `^9.9.4`, in `peerDependencies`)


- [#1495](https://github.com/graphql-hive/gateway/pull/1495) [`fe99f74`](https://github.com/graphql-hive/gateway/commit/fe99f74dd11fdf2928ca7080d4d2e5dfd1e2f18e) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`@logtape/logtape@^1.1.0` ↗︎](https://www.npmjs.com/package/@logtape/logtape/v/1.1.0) (from `^1.0.5`, in `peerDependencies`)

## 1.0.2
### Patch Changes



- [#1452](https://github.com/graphql-hive/gateway/pull/1452) [`b0e5568`](https://github.com/graphql-hive/gateway/commit/b0e55688d4fc22d0bfbf664de52e78e9642d7014) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`@logtape/logtape@^1.0.4` ↗︎](https://www.npmjs.com/package/@logtape/logtape/v/1.0.4) (from `^1.0.0`, in `peerDependencies`)
  - Updated dependency [`pino@^9.9.4` ↗︎](https://www.npmjs.com/package/pino/v/9.9.4) (from `^9.6.0`, in `peerDependencies`)


- [#1452](https://github.com/graphql-hive/gateway/pull/1452) [`b0e5568`](https://github.com/graphql-hive/gateway/commit/b0e55688d4fc22d0bfbf664de52e78e9642d7014) Thanks [@dependabot](https://github.com/apps/dependabot)! - Relax `PinoLogWriter`'s typings for `FastifyLogger` compatibility

## 1.0.1
### Patch Changes



- [#956](https://github.com/graphql-hive/gateway/pull/956) [`46d2661`](https://github.com/graphql-hive/gateway/commit/46d26615c2c3c5f936c1d1bca1d03b025c1ce86a) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Introducing Hive Logger
  
  [Read more about it on the Hive Logger documentation website.](https://the-guild.dev/graphql/hive/docs/logger)
