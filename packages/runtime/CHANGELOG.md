# @graphql-hive/gateway-runtime

## 1.1.7

### Patch Changes

- [#105](https://github.com/graphql-hive/gateway/pull/105) [`bca7230`](https://github.com/graphql-hive/gateway/commit/bca72302580289dd6c4fec1da988465ff894e745) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/fusion-runtime@^0.10.2` ↗︎](https://www.npmjs.com/package/@graphql-mesh/fusion-runtime/v/0.10.2) (from `^0.10.1`, in `dependencies`)

- [#108](https://github.com/graphql-hive/gateway/pull/108) [`86c7ac1`](https://github.com/graphql-hive/gateway/commit/86c7ac1df787e9d38bdb001483b0588ada962c5c) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/hmac-upstream-signature@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-mesh/hmac-upstream-signature/v/workspace:^) (from `^1.1.0`, in `dependencies`)

- [#118](https://github.com/graphql-hive/gateway/pull/118) [`73c621d`](https://github.com/graphql-hive/gateway/commit/73c621d98a4e6ca134527e349bc71223c03d06db) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-tools/batch-delegate@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-tools/batch-delegate/v/workspace:^) (from `^9.0.13`, in `dependencies`)
  - Updated dependency [`@graphql-tools/delegate@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-tools/delegate/v/workspace:^) (from `^10.1.1`, in `dependencies`)
  - Updated dependency [`@graphql-tools/executor-http@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-tools/executor-http/v/workspace:^) (from `^1.1.5`, in `dependencies`)
  - Updated dependency [`@graphql-tools/federation@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-tools/federation/v/workspace:^) (from `^2.2.25`, in `dependencies`)
  - Updated dependency [`@graphql-tools/stitch@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-tools/stitch/v/workspace:^) (from `^9.3.3`, in `dependencies`)
  - Updated dependency [`@graphql-tools/wrap@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-tools/wrap/v/workspace:^) (from `^10.0.15`, in `dependencies`)

- [#88](https://github.com/graphql-hive/gateway/pull/88) [`4288177`](https://github.com/graphql-hive/gateway/commit/4288177ed6e6df7bb741891754d67f8ec0aea9cf) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.3.0` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.3.0) (from `^0.2.0`, in `dependencies`)

- [#96](https://github.com/graphql-hive/gateway/pull/96) [`65b7444`](https://github.com/graphql-hive/gateway/commit/65b74449c2a01b9c229d10f5da25814397083865) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.4.0` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.4.0) (from `^0.3.0`, in `dependencies`)

- [`387e346`](https://github.com/graphql-hive/gateway/commit/387e346dbd8c27ecbdb3a6dec6fb64863432b38c) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Use process from the global scope for cwd or no cwd

- [`c95d25e`](https://github.com/graphql-hive/gateway/commit/c95d25e3a2dbe20795f88965cdcd22a49f51f1c1) Thanks [@enisdenjo](https://github.com/enisdenjo)! - `onError` and `onEnd` callbacks from `onSubgraphExecute` are invoked only once regardless of how many times throw/return was called on the iterator

- [`e73b2be`](https://github.com/graphql-hive/gateway/commit/e73b2bece94772fb14f33777c71524ac6a292bc4) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Use ranged dependencies from the monorepo

- Updated dependencies [[`86c7ac1`](https://github.com/graphql-hive/gateway/commit/86c7ac1df787e9d38bdb001483b0588ada962c5c), [`73c621d`](https://github.com/graphql-hive/gateway/commit/73c621d98a4e6ca134527e349bc71223c03d06db), [`73c621d`](https://github.com/graphql-hive/gateway/commit/73c621d98a4e6ca134527e349bc71223c03d06db), [`b84b8f9`](https://github.com/graphql-hive/gateway/commit/b84b8f99d9431a6865303aee001dd62ef9eb5d26), [`c95d25e`](https://github.com/graphql-hive/gateway/commit/c95d25e3a2dbe20795f88965cdcd22a49f51f1c1), [`73c621d`](https://github.com/graphql-hive/gateway/commit/73c621d98a4e6ca134527e349bc71223c03d06db), [`19bc6a4`](https://github.com/graphql-hive/gateway/commit/19bc6a4c222ff157553785ea16760888cdfe10bb)]:
  - @graphql-mesh/fusion-runtime@0.10.3
  - @graphql-mesh/transport-common@0.7.14
  - @graphql-tools/delegate@10.1.3
  - @graphql-mesh/hmac-upstream-signature@1.2.7
  - @graphql-tools/wrap@10.0.17
  - @graphql-tools/batch-delegate@9.0.15
  - @graphql-tools/federation@2.2.28
  - @graphql-tools/stitch@9.3.5

## 1.1.6

### Patch Changes

- [`eebfc84`](https://github.com/graphql-hive/gateway/commit/eebfc84567720f771296ead420bfbc1015c8e0c3) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Inject helpers containing code that detects at runtime if the required value contains the `__esModule` property.

## 1.1.5

### Patch Changes

- [#79](https://github.com/graphql-hive/gateway/pull/79) [`7c9560a`](https://github.com/graphql-hive/gateway/commit/7c9560aa77bf40c37074eb5b77f9941664062b5e) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/fusion-runtime@^0.10.1` ↗︎](https://www.npmjs.com/package/@graphql-mesh/fusion-runtime/v/0.10.1) (from `^0.10.0`, in `dependencies`)

## 1.1.4

### Patch Changes

- [#77](https://github.com/graphql-hive/gateway/pull/77) [`9a0b434`](https://github.com/graphql-hive/gateway/commit/9a0b4346a9344add8e933c7d1a2706e759cb56de) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/fusion-runtime@^0.10.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/fusion-runtime/v/0.10.0) (from `^0.9.0`, in `dependencies`)

## 1.1.3

### Patch Changes

- [#71](https://github.com/graphql-hive/gateway/pull/71) [`ccee7f2`](https://github.com/graphql-hive/gateway/commit/ccee7f2bc36a5990bb9b944b6c6bad47305bcb17) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Removed dependency [`@graphql-mesh/transport-http@^0.6.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/transport-http/v/0.6.7) (from `dependencies`)

## 1.1.2

### Patch Changes

- [#63](https://github.com/graphql-hive/gateway/pull/63) [`6ad4b1a`](https://github.com/graphql-hive/gateway/commit/6ad4b1aa998e8753779e01737c4bea733580819f) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-tools/batch-delegate@^9.0.13` ↗︎](https://www.npmjs.com/package/@graphql-tools/batch-delegate/v/9.0.13) (from `^9.0.11`, in `dependencies`)
  - Updated dependency [`@graphql-tools/delegate@^10.1.1` ↗︎](https://www.npmjs.com/package/@graphql-tools/delegate/v/10.1.1) (from `^10.0.29`, in `dependencies`)
  - Updated dependency [`@graphql-tools/federation@^2.2.25` ↗︎](https://www.npmjs.com/package/@graphql-tools/federation/v/2.2.25) (from `^2.2.23`, in `dependencies`)
  - Updated dependency [`@graphql-tools/stitch@^9.3.3` ↗︎](https://www.npmjs.com/package/@graphql-tools/stitch/v/9.3.3) (from `^9.3.1`, in `dependencies`)
  - Updated dependency [`@graphql-tools/wrap@^10.0.15` ↗︎](https://www.npmjs.com/package/@graphql-tools/wrap/v/10.0.15) (from `^10.0.13`, in `dependencies`)

## 1.1.1

### Patch Changes

- [#50](https://github.com/graphql-hive/gateway/pull/50) [`07fe045`](https://github.com/graphql-hive/gateway/commit/07fe0458935ff0f171db8c9fa96bdbdd02884716) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.2.0` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.2.0) (from `^0.1.0`, in `dependencies`)

## 1.1.0

### Minor Changes

- [#46](https://github.com/graphql-hive/gateway/pull/46) [`106eace`](https://github.com/graphql-hive/gateway/commit/106eacee488670155a11e539655d8c4c22d54ffe) Thanks [@aarne](https://github.com/aarne)! - Ability to return headers with multiple values from propagateHeaders.fromSubgraphsToClient

### Patch Changes

- [#51](https://github.com/graphql-hive/gateway/pull/51) [`7f5e0b0`](https://github.com/graphql-hive/gateway/commit/7f5e0b07a3e3bdd6d84bc9527fa1f83db5fe0c45) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-tools/batch-delegate@^9.0.11` ↗︎](https://www.npmjs.com/package/@graphql-tools/batch-delegate/v/9.0.11) (from `^9.0.3`, in `dependencies`)
  - Updated dependency [`@graphql-tools/delegate@^10.0.29` ↗︎](https://www.npmjs.com/package/@graphql-tools/delegate/v/10.0.29) (from `^10.0.21`, in `dependencies`)
  - Updated dependency [`@graphql-tools/federation@^2.2.23` ↗︎](https://www.npmjs.com/package/@graphql-tools/federation/v/2.2.23) (from `^2.2.10`, in `dependencies`)
  - Updated dependency [`@graphql-tools/stitch@^9.3.1` ↗︎](https://www.npmjs.com/package/@graphql-tools/stitch/v/9.3.1) (from `^9.2.10`, in `dependencies`)
  - Updated dependency [`@graphql-tools/wrap@^10.0.13` ↗︎](https://www.npmjs.com/package/@graphql-tools/wrap/v/10.0.13) (from `^10.0.5`, in `dependencies`)

## 1.0.0

### Major Changes

- [#17](https://github.com/graphql-hive/gateway/pull/17) [`53a8d59`](https://github.com/graphql-hive/gateway/commit/53a8d590941d84345c4a49a854404eef3a0c04d9) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Hive Gateway has been moved to a new GitHub repository! You can now find it at [github.com/graphql-hive/gateway](https://github.com/graphql-hive/gateway).
