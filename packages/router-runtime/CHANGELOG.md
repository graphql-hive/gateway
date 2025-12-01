# @graphql-hive/router-runtime

## 1.1.1
### Patch Changes

- Updated dependencies []:
  - @graphql-tools/federation@4.2.5
  - @graphql-mesh/fusion-runtime@1.6.1

## 1.1.0
### Minor Changes



- [#1708](https://github.com/graphql-hive/gateway/pull/1708) [`bc6cddd`](https://github.com/graphql-hive/gateway/commit/bc6cddd1c53a012dd02a1d8a7217a28e65cc6ae9) Thanks [@ardatan](https://github.com/ardatan)! - Support Stitching transforms (w/ Mesh directives)


### Patch Changes



- [#1727](https://github.com/graphql-hive/gateway/pull/1727) [`1dbc653`](https://github.com/graphql-hive/gateway/commit/1dbc6536cb992a705cac7894acca6fe5431b72de) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  
  - Updated dependency [`@graphql-hive/router-query-planner@^0.0.4` ↗︎](https://www.npmjs.com/package/@graphql-hive/router-query-planner/v/0.0.4) (from `^0.0.3`, in `dependencies`)


- [#1739](https://github.com/graphql-hive/gateway/pull/1739) [`8ff2e47`](https://github.com/graphql-hive/gateway/commit/8ff2e471f368d5e41f91a7fe1f1b0e494ef3e6ff) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  
  - Updated dependency [`@graphql-hive/router-query-planner@^0.0.6` ↗︎](https://www.npmjs.com/package/@graphql-hive/router-query-planner/v/0.0.6) (from `^0.0.4`, in `dependencies`)


- [#1740](https://github.com/graphql-hive/gateway/pull/1740) [`9cfe2a5`](https://github.com/graphql-hive/gateway/commit/9cfe2a555fcbc9a70ba04b32d6844a7a795de624) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`@graphql-hive/router-query-planner@^0.0.6` ↗︎](https://www.npmjs.com/package/@graphql-hive/router-query-planner/v/0.0.6) (from `^0.0.4`, in `dependencies`)


- [#1708](https://github.com/graphql-hive/gateway/pull/1708) [`bc6cddd`](https://github.com/graphql-hive/gateway/commit/bc6cddd1c53a012dd02a1d8a7217a28e65cc6ae9) Thanks [@ardatan](https://github.com/ardatan)! - Handle listed enum values correctly
  Previously when a field like `[MyEnum!]!` is projected, it was projecting it like it is `MyEnum`.


- [#1739](https://github.com/graphql-hive/gateway/pull/1739) [`8ff2e47`](https://github.com/graphql-hive/gateway/commit/8ff2e471f368d5e41f91a7fe1f1b0e494ef3e6ff) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Expose the query plan by using the `useQueryPlan` plugin

- Updated dependencies [[`bc6cddd`](https://github.com/graphql-hive/gateway/commit/bc6cddd1c53a012dd02a1d8a7217a28e65cc6ae9)]:
  - @graphql-mesh/fusion-runtime@1.6.0
  - @graphql-tools/federation@4.2.4

## 1.0.1
### Patch Changes



- [#1691](https://github.com/graphql-hive/gateway/pull/1691) [`7ecaf7e`](https://github.com/graphql-hive/gateway/commit/7ecaf7e8f658c4e4c1a91d1e8db3c1a8ceca51cb) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  
  - Updated dependency [`@graphql-tools/executor@^1.4.13` ↗︎](https://www.npmjs.com/package/@graphql-tools/executor/v/1.4.13) (from `^1.4.11`, in `dependencies`)
  - Updated dependency [`@graphql-tools/utils@^10.10.3` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.10.3) (from `^10.9.1`, in `dependencies`)
- Updated dependencies [[`7ecaf7e`](https://github.com/graphql-hive/gateway/commit/7ecaf7e8f658c4e4c1a91d1e8db3c1a8ceca51cb), [`7ecaf7e`](https://github.com/graphql-hive/gateway/commit/7ecaf7e8f658c4e4c1a91d1e8db3c1a8ceca51cb), [`7ecaf7e`](https://github.com/graphql-hive/gateway/commit/7ecaf7e8f658c4e4c1a91d1e8db3c1a8ceca51cb), [`478d7e2`](https://github.com/graphql-hive/gateway/commit/478d7e25ef47fb8fb6183010a8bb61ac31688c55), [`7ecaf7e`](https://github.com/graphql-hive/gateway/commit/7ecaf7e8f658c4e4c1a91d1e8db3c1a8ceca51cb)]:
  - @graphql-mesh/fusion-runtime@1.5.1
  - @graphql-mesh/transport-common@1.0.12
  - @graphql-tools/executor-common@1.0.5
  - @graphql-tools/federation@4.2.3

## 1.0.0
### Major Changes



- [#1629](https://github.com/graphql-hive/gateway/pull/1629) [`073a078`](https://github.com/graphql-hive/gateway/commit/073a078c8cdbdd4ec33fdb9d3aeb4955fbcfb103) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Hive Router Runtime for Hive Gateway
  
  [Read more about it in the documentation.](https://the-guild.dev/graphql/hive/docs/gateway/other-features/router-runtime)

### Patch Changes

- Updated dependencies [[`073a078`](https://github.com/graphql-hive/gateway/commit/073a078c8cdbdd4ec33fdb9d3aeb4955fbcfb103)]:
  - @graphql-mesh/fusion-runtime@1.5.0
