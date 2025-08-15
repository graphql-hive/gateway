# @graphql-hive/gateway-runtime

## 1.10.3

### Patch Changes

- [#1383](https://github.com/graphql-hive/gateway/pull/1383) [`a832e7b`](https://github.com/graphql-hive/gateway/commit/a832e7bf9a8f92c48fb9df8ca1bff5a008dcf420) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/plugin-response-cache@^0.104.8` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-response-cache/v/0.104.8) (from `^0.104.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.104.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.104.7) (from `^0.104.5`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.104.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.104.7) (from `^0.104.5`, in `dependencies`)

- Updated dependencies [[`a832e7b`](https://github.com/graphql-hive/gateway/commit/a832e7bf9a8f92c48fb9df8ca1bff5a008dcf420), [`a832e7b`](https://github.com/graphql-hive/gateway/commit/a832e7bf9a8f92c48fb9df8ca1bff5a008dcf420), [`a832e7b`](https://github.com/graphql-hive/gateway/commit/a832e7bf9a8f92c48fb9df8ca1bff5a008dcf420), [`a832e7b`](https://github.com/graphql-hive/gateway/commit/a832e7bf9a8f92c48fb9df8ca1bff5a008dcf420)]:
  - @graphql-hive/logger-json@0.0.7
  - @graphql-mesh/fusion-runtime@0.11.20
  - @graphql-mesh/hmac-upstream-signature@1.2.31
  - @graphql-mesh/transport-common@0.7.38

## 1.10.2

### Patch Changes

- [#1358](https://github.com/graphql-hive/gateway/pull/1358) [`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@graphql-tools/utils@^10.9.1` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.9.1) (from `^10.9.0`, in `dependencies`)

- [#1361](https://github.com/graphql-hive/gateway/pull/1361) [`38e5173`](https://github.com/graphql-hive/gateway/commit/38e51731e31e9e8bcdbeb370ae7cac5657a6f6d3) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@whatwg-node/server@^0.10.11` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.10.11) (from `^0.10.10`, in `dependencies`)

- [#1366](https://github.com/graphql-hive/gateway/pull/1366) [`6cedc05`](https://github.com/graphql-hive/gateway/commit/6cedc056ef4070bc1719fbe222d60c0d48af5a71) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Use the merge resolver for delegated subgraph schemas

- Updated dependencies [[`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1), [`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1), [`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1), [`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1), [`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1), [`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1), [`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1), [`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1), [`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1), [`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1)]:
  - @graphql-mesh/fusion-runtime@0.11.19
  - @graphql-mesh/hmac-upstream-signature@1.2.30
  - @graphql-mesh/transport-common@0.7.37
  - @graphql-tools/batch-delegate@9.0.41
  - @graphql-tools/delegate@10.2.23
  - @graphql-tools/executor-common@0.0.6
  - @graphql-tools/executor-http@2.1.1
  - @graphql-tools/federation@3.2.8
  - @graphql-tools/stitch@9.4.28
  - @graphql-tools/wrap@10.1.4

## 1.10.1

### Patch Changes

- [#1355](https://github.com/graphql-hive/gateway/pull/1355) [`352e89d`](https://github.com/graphql-hive/gateway/commit/352e89d496ecd19db02cbaa2ade58c2da77d69c6) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Run the persisted documents plugin before the usage reporting and registry plugin

  Making sure the queries are discovered before being reported.

- Updated dependencies []:
  - @graphql-mesh/hmac-upstream-signature@1.2.29

## 1.10.0

### Minor Changes

- [#1310](https://github.com/graphql-hive/gateway/pull/1310) [`2fa0c8f`](https://github.com/graphql-hive/gateway/commit/2fa0c8f1dd074c9da8e6ac4086eb3009be9fdf07) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - Added new `withState` plugin utility for easy data sharing between hooks.

  ## New plugin utility to ease data sharing between hooks

  Sometimes, plugins can grow in complexity and need to share data between its hooks.

  A way to solve this can be to mutate the graphql context, but this context is not always available
  in all hooks in Yoga or Hive Gateway plugins. Moreover, mutating the context gives access to your
  internal data to all other plugins and graphql resolvers, without mentioning performance impact on
  field access on this object.

  The recommended approach to this problem was to use a `WeakMap` with a stable key (often the
  `context` or `request` object). While it works, it's not very convenient for plugin developers, and
  is prone to error with the choice of key.

  The new `withState` utility solves this DX issue by providing an easy and straightforward API for
  data sharing between hooks.

  ```ts
  import { withState } from '@graphql-hive/gateway';

  type State = { foo: string };

  const myPlugin = () =>
    withState<Plugin, State>(() => ({
      onParse({ state }) {
        state.forOperation.foo = 'foo';
      },
      onValidate({ state }) {
        const { foo } = state.forOperation;
        console.log('foo', foo);
      },
    }));
  ```

  The `state` payload field will be available in all relevant hooks, making it easy to access shared
  data. It also forces the developer to choose the scope for the data:
  - `forOperation` for a data scoped to GraphQL operation (Envelop, Yoga and Hive Gateway)
  - `forRequest` for a data scoped to HTTP request (Yoga and Hive Gateway)
  - `forSubgraphExecution` for a data scoped to the subgraph execution (Hive Gateway)

  Not all scopes are available in all hooks, the type reflects which scopes are available

  Under the hood, those states are kept in memory using `WeakMap`, which avoid any memory leaks.

  It is also possible to manually retrieve the state with the `getState` function:

  ```ts
  const myPlugin = () =>
    withState((getState) => ({
      onParse({ context }) {
        // You can provide a payload, which will dictate which scope you have access to.
        // The scope can contain `context`, `request` and `executionRequest` fields.
        const state = getState({ context });
        // Use the state elsewhere.
      },
    }));
  ```

- [#1308](https://github.com/graphql-hive/gateway/pull/1308) [`9b230f3`](https://github.com/graphql-hive/gateway/commit/9b230f35b47afbf3b253e4c21720e836c5a2a8d1) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Improved landing page visuals and new logo

### Patch Changes

- [#1318](https://github.com/graphql-hive/gateway/pull/1318) [`7dafdeb`](https://github.com/graphql-hive/gateway/commit/7dafdebc803e49373fe9d53997113483e512fdb0) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.10.1` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.10.1) (from `^0.8.6`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-csrf-prevention@^3.15.1` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-csrf-prevention/v/3.15.1) (from `^3.13.5`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-defer-stream@^3.15.1` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-defer-stream/v/3.15.1) (from `^3.13.5`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-persisted-operations@^3.15.1` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-persisted-operations/v/3.15.1) (from `^3.13.6`, in `dependencies`)
  - Updated dependency [`graphql-yoga@^5.15.1` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.15.1) (from `^5.13.5`, in `dependencies`)

- [#1321](https://github.com/graphql-hive/gateway/pull/1321) [`6215001`](https://github.com/graphql-hive/gateway/commit/6215001b1d650ad865331661532bcc4f7bad6b40) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@envelop/core@^5.3.0` ↗︎](https://www.npmjs.com/package/@envelop/core/v/5.3.0) (from `^5.2.3`, in `dependencies`)
  - Updated dependency [`@graphql-hive/core@^0.13.0` ↗︎](https://www.npmjs.com/package/@graphql-hive/core/v/0.13.0) (from `^0.12.0`, in `dependencies`)
  - Updated dependency [`@graphql-hive/yoga@^0.42.2` ↗︎](https://www.npmjs.com/package/@graphql-hive/yoga/v/0.42.2) (from `^0.42.1`, in `dependencies`)

- [#1328](https://github.com/graphql-hive/gateway/pull/1328) [`f12f2b7`](https://github.com/graphql-hive/gateway/commit/f12f2b78163fbef797a42b5999a0b5a8ef6b2c98) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@envelop/disable-introspection@^8.0.0` ↗︎](https://www.npmjs.com/package/@envelop/disable-introspection/v/8.0.0) (from `^7.0.0`, in `dependencies`)

- [#1329](https://github.com/graphql-hive/gateway/pull/1329) [`ce99e43`](https://github.com/graphql-hive/gateway/commit/ce99e43b9fec43c665836bd3a282ce6d4302481d) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`graphql-ws@^6.0.6` ↗︎](https://www.npmjs.com/package/graphql-ws/v/6.0.6) (from `^6.0.4`, in `dependencies`)

- [#1344](https://github.com/graphql-hive/gateway/pull/1344) [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@graphql-tools/utils@^10.9.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.9.0) (from `^10.8.1`, in `dependencies`)

- [#1333](https://github.com/graphql-hive/gateway/pull/1333) [`ffa3753`](https://github.com/graphql-hive/gateway/commit/ffa3753ccb9045c5b2d62af05edc7f1d78336cb3) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Isomorphic environment variable getter with truthy value parsing

- [#1350](https://github.com/graphql-hive/gateway/pull/1350) [`1fe005f`](https://github.com/graphql-hive/gateway/commit/1fe005f270c9fd0f8fcd2d0c3ffc27d722638f57) Thanks [@enisdenjo](https://github.com/enisdenjo)! - `allowArbitraryDocuments` option for persisted documents coming from Hive (`persistedDocuments: { type: 'hive' }`) can be a factory function

- Updated dependencies [[`7dafdeb`](https://github.com/graphql-hive/gateway/commit/7dafdebc803e49373fe9d53997113483e512fdb0), [`6215001`](https://github.com/graphql-hive/gateway/commit/6215001b1d650ad865331661532bcc4f7bad6b40), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a), [`6215001`](https://github.com/graphql-hive/gateway/commit/6215001b1d650ad865331661532bcc4f7bad6b40), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a), [`6215001`](https://github.com/graphql-hive/gateway/commit/6215001b1d650ad865331661532bcc4f7bad6b40), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a), [`7287ffa`](https://github.com/graphql-hive/gateway/commit/7287ffa2ac0f08801c3058e96a7c4eba7102c1d0), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a), [`7dafdeb`](https://github.com/graphql-hive/gateway/commit/7dafdebc803e49373fe9d53997113483e512fdb0), [`7287ffa`](https://github.com/graphql-hive/gateway/commit/7287ffa2ac0f08801c3058e96a7c4eba7102c1d0), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a), [`ffa3753`](https://github.com/graphql-hive/gateway/commit/ffa3753ccb9045c5b2d62af05edc7f1d78336cb3), [`b59a266`](https://github.com/graphql-hive/gateway/commit/b59a26628c368272b50380bab57553070e2edf6e)]:
  - @graphql-mesh/fusion-runtime@0.11.18
  - @graphql-mesh/hmac-upstream-signature@1.2.29
  - @graphql-mesh/transport-common@0.7.36
  - @graphql-tools/batch-delegate@9.0.40
  - @graphql-tools/delegate@10.2.22
  - @graphql-tools/executor-common@0.0.5
  - @graphql-tools/executor-http@2.1.0
  - @graphql-tools/federation@3.2.7
  - @graphql-tools/stitch@9.4.27
  - @graphql-tools/wrap@10.1.3
  - @graphql-hive/logger-json@0.0.6

## 1.9.4

### Patch Changes

- Updated dependencies [[`b69c80b`](https://github.com/graphql-hive/gateway/commit/b69c80b259bd0565eb9826f7ee9bc8e6c32076d1)]:
  - @graphql-tools/delegate@10.2.21
  - @graphql-tools/batch-delegate@9.0.39
  - @graphql-tools/federation@3.2.6
  - @graphql-mesh/fusion-runtime@0.11.17
  - @graphql-tools/stitch@9.4.26
  - @graphql-tools/wrap@10.1.2
  - @graphql-mesh/hmac-upstream-signature@1.2.28

## 1.9.3

### Patch Changes

- Updated dependencies [[`0655d1f`](https://github.com/graphql-hive/gateway/commit/0655d1fc604179b6cc0c148d73e38d6e8d839c56), [`0655d1f`](https://github.com/graphql-hive/gateway/commit/0655d1fc604179b6cc0c148d73e38d6e8d839c56), [`0655d1f`](https://github.com/graphql-hive/gateway/commit/0655d1fc604179b6cc0c148d73e38d6e8d839c56)]:
  - @graphql-tools/delegate@10.2.20
  - @graphql-tools/batch-delegate@9.0.38
  - @graphql-tools/federation@3.2.5
  - @graphql-mesh/fusion-runtime@0.11.16
  - @graphql-tools/stitch@9.4.25
  - @graphql-tools/wrap@10.1.1
  - @graphql-mesh/hmac-upstream-signature@1.2.28

## 1.9.2

### Patch Changes

- [#1217](https://github.com/graphql-hive/gateway/pull/1217) [`931d576`](https://github.com/graphql-hive/gateway/commit/931d5763c1f8c6d7fdc299bd87a634fecdd70b15) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@types/node@^22.15.30` ↗︎](https://www.npmjs.com/package/@types/node/v/22.15.30) (from `^22.15.29`, in `dependencies`)

- [#1245](https://github.com/graphql-hive/gateway/pull/1245) [`29f537f`](https://github.com/graphql-hive/gateway/commit/29f537f7dfcf17f3911efd5845d7af1e532d2e85) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/utils@^0.104.5` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.104.5) (from `^0.104.2`, in `dependencies`)

- [#1258](https://github.com/graphql-hive/gateway/pull/1258) [`3d24beb`](https://github.com/graphql-hive/gateway/commit/3d24beb7b15fd8109f86bbb3dfd514f6b8202741) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/plugin-response-cache@^0.104.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-response-cache/v/0.104.6) (from `^0.104.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.104.5` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.104.5) (from `^0.104.0`, in `dependencies`)

- [#1245](https://github.com/graphql-hive/gateway/pull/1245) [`29f537f`](https://github.com/graphql-hive/gateway/commit/29f537f7dfcf17f3911efd5845d7af1e532d2e85) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Propagate headers even from cache

- [#1261](https://github.com/graphql-hive/gateway/pull/1261) [`1023f3d`](https://github.com/graphql-hive/gateway/commit/1023f3db8bdca8b0a9004841c7341dc3d18b1858) Thanks [@comatory](https://github.com/comatory)! - Forward only defined headers to subgraphs from clients

- [#1245](https://github.com/graphql-hive/gateway/pull/1245) [`29f537f`](https://github.com/graphql-hive/gateway/commit/29f537f7dfcf17f3911efd5845d7af1e532d2e85) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Propagate headers even from cache

- [#1261](https://github.com/graphql-hive/gateway/pull/1261) [`1023f3d`](https://github.com/graphql-hive/gateway/commit/1023f3db8bdca8b0a9004841c7341dc3d18b1858) Thanks [@comatory](https://github.com/comatory)! - Correct header propagation return types allowing nullish values

- Updated dependencies [[`29f537f`](https://github.com/graphql-hive/gateway/commit/29f537f7dfcf17f3911efd5845d7af1e532d2e85), [`3d24beb`](https://github.com/graphql-hive/gateway/commit/3d24beb7b15fd8109f86bbb3dfd514f6b8202741), [`29f537f`](https://github.com/graphql-hive/gateway/commit/29f537f7dfcf17f3911efd5845d7af1e532d2e85), [`3d24beb`](https://github.com/graphql-hive/gateway/commit/3d24beb7b15fd8109f86bbb3dfd514f6b8202741), [`29f537f`](https://github.com/graphql-hive/gateway/commit/29f537f7dfcf17f3911efd5845d7af1e532d2e85), [`3d24beb`](https://github.com/graphql-hive/gateway/commit/3d24beb7b15fd8109f86bbb3dfd514f6b8202741), [`3d24beb`](https://github.com/graphql-hive/gateway/commit/3d24beb7b15fd8109f86bbb3dfd514f6b8202741), [`ed323fa`](https://github.com/graphql-hive/gateway/commit/ed323fa06d196c1df128a493006238078bf69fc6)]:
  - @graphql-hive/logger-json@0.0.5
  - @graphql-mesh/fusion-runtime@0.11.15
  - @graphql-mesh/hmac-upstream-signature@1.2.28
  - @graphql-mesh/transport-common@0.7.35
  - @graphql-tools/executor-http@2.0.3
  - @graphql-tools/federation@3.2.4

## 1.9.1

### Patch Changes

- [#1195](https://github.com/graphql-hive/gateway/pull/1195) [`cdc959c`](https://github.com/graphql-hive/gateway/commit/cdc959c57dd770fd5f0bcd05a5de7e3102dacfe2) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@types/node@^22.15.29` ↗︎](https://www.npmjs.com/package/@types/node/v/22.15.29) (from `^22.15.27`, in `dependencies`)

- Updated dependencies []:
  - @graphql-mesh/hmac-upstream-signature@1.2.27

## 1.9.0

### Minor Changes

- [#1148](https://github.com/graphql-hive/gateway/pull/1148) [`b4ba778`](https://github.com/graphql-hive/gateway/commit/b4ba778776140b66b8368daf0299105fd8035e46) Thanks [@maon-fp](https://github.com/maon-fp)! - Introducing `renderGraphiQL` feature to provide GraphiQL without a CDN involved

- [#1139](https://github.com/graphql-hive/gateway/pull/1139) [`11cff4f`](https://github.com/graphql-hive/gateway/commit/11cff4f8ff28ca7d709b5b962029e17d5843110e) Thanks [@ardatan](https://github.com/ardatan)! - Add `cookies` property to the configuration for cookies processing which is already documented in [here](https://the-guild.dev/graphql/hive/docs/gateway/authorization-authentication#token-lookup)

### Patch Changes

- [#1139](https://github.com/graphql-hive/gateway/pull/1139) [`11cff4f`](https://github.com/graphql-hive/gateway/commit/11cff4f8ff28ca7d709b5b962029e17d5843110e) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Added dependency [`@whatwg-node/server-plugin-cookies@^1.0.5` ↗︎](https://www.npmjs.com/package/@whatwg-node/server-plugin-cookies/v/1.0.5) (to `dependencies`)

- [#1144](https://github.com/graphql-hive/gateway/pull/1144) [`54beb7a`](https://github.com/graphql-hive/gateway/commit/54beb7acde7558eee81ec0e20c123717865b8e18) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@whatwg-node/server@^0.10.9` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.10.9) (from `^0.10.8`, in `dependencies`)

- [#1156](https://github.com/graphql-hive/gateway/pull/1156) [`fb74009`](https://github.com/graphql-hive/gateway/commit/fb740098652dba2e9107981d1f4e362143478451) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@graphql-hive/core@^0.12.0` ↗︎](https://www.npmjs.com/package/@graphql-hive/core/v/0.12.0) (from `^0.11.0`, in `dependencies`)
  - Updated dependency [`@graphql-hive/yoga@^0.42.1` ↗︎](https://www.npmjs.com/package/@graphql-hive/yoga/v/0.42.1) (from `^0.42.0`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.8.6` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.8.6) (from `^0.8.0`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-csrf-prevention@^3.13.5` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-csrf-prevention/v/3.13.5) (from `^3.12.0`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-defer-stream@^3.13.5` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-defer-stream/v/3.13.5) (from `^3.12.0`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-persisted-operations@^3.13.6` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-persisted-operations/v/3.13.6) (from `^3.12.0`, in `dependencies`)
  - Updated dependency [`@types/node@^22.15.21` ↗︎](https://www.npmjs.com/package/@types/node/v/22.15.21) (from `^22.7.5`, in `dependencies`)
  - Updated dependency [`@whatwg-node/server@^0.10.10` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.10.10) (from `^0.10.9`, in `dependencies`)
  - Updated dependency [`graphql-yoga@^5.13.5` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.13.5) (from `^5.13.4`, in `dependencies`)

- [#1182](https://github.com/graphql-hive/gateway/pull/1182) [`f3615ca`](https://github.com/graphql-hive/gateway/commit/f3615cab4e8b596e5ba21b03fddb66e9a3090e31) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@types/node@^22.15.23` ↗︎](https://www.npmjs.com/package/@types/node/v/22.15.23) (from `^22.15.21`, in `dependencies`)

- [#1188](https://github.com/graphql-hive/gateway/pull/1188) [`d459f37`](https://github.com/graphql-hive/gateway/commit/d459f3702c500c321164abec826700120649c180) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@types/node@^22.15.27` ↗︎](https://www.npmjs.com/package/@types/node/v/22.15.27) (from `^22.15.23`, in `dependencies`)

- Updated dependencies [[`fb74009`](https://github.com/graphql-hive/gateway/commit/fb740098652dba2e9107981d1f4e362143478451), [`54beb7a`](https://github.com/graphql-hive/gateway/commit/54beb7acde7558eee81ec0e20c123717865b8e18), [`54beb7a`](https://github.com/graphql-hive/gateway/commit/54beb7acde7558eee81ec0e20c123717865b8e18), [`4a80de1`](https://github.com/graphql-hive/gateway/commit/4a80de1a2884dc42a5f09202b6215c3e6780efc4), [`f634b53`](https://github.com/graphql-hive/gateway/commit/f634b53478199c2b783a608e22fbe51401942039), [`85d7c95`](https://github.com/graphql-hive/gateway/commit/85d7c95cfe90773daf7680f2308ff4f52f0f7fa9), [`511ba36`](https://github.com/graphql-hive/gateway/commit/511ba36d9c8b81f83cf4cb37c03c9fbb9c5c9c9d), [`dca6529`](https://github.com/graphql-hive/gateway/commit/dca6529b234f1e178ad87a8992c5a7de12831128)]:
  - @graphql-mesh/fusion-runtime@0.11.14
  - @graphql-tools/executor-http@2.0.2
  - @graphql-tools/federation@3.2.3
  - @graphql-tools/wrap@10.1.0
  - @graphql-tools/batch-delegate@9.0.37
  - @graphql-mesh/hmac-upstream-signature@1.2.27
  - @graphql-tools/stitch@9.4.24
  - @graphql-tools/delegate@10.2.19

## 1.8.3

### Patch Changes

- [#1115](https://github.com/graphql-hive/gateway/pull/1115) [`162693e`](https://github.com/graphql-hive/gateway/commit/162693ebceca9dba0eb748d36549e4af0cbfd91b) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-hive/core@^0.11.0` ↗︎](https://www.npmjs.com/package/@graphql-hive/core/v/0.11.0) (from `^0.10.0`, in `dependencies`)
  - Updated dependency [`@graphql-hive/yoga@^0.42.0` ↗︎](https://www.npmjs.com/package/@graphql-hive/yoga/v/0.42.0) (from `^0.41.0`, in `dependencies`)

- [#1128](https://github.com/graphql-hive/gateway/pull/1128) [`4acd5ca`](https://github.com/graphql-hive/gateway/commit/4acd5ca8d591c442eed151d2dcf2fffee55f57e8) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@whatwg-node/server@^0.10.8` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.10.8) (from `^0.10.5`, in `dependencies`)

- [#1113](https://github.com/graphql-hive/gateway/pull/1113) [`88c9369`](https://github.com/graphql-hive/gateway/commit/88c9369abfdcb8e5ed8331c12a42a90e3b6b211b) Thanks [@ardatan](https://github.com/ardatan)! - Handle serving subgraphs when;
  - No entity is found
  - Query root type has a different name than `Query`
  - Federation transform by adding `@key` directive to a type but without a resolver

- [#1027](https://github.com/graphql-hive/gateway/pull/1027) [`faffc17`](https://github.com/graphql-hive/gateway/commit/faffc17e72f8893e7e717d5a425205a6364e4d44) Thanks [@ardatan](https://github.com/ardatan)! - If metadata is included the result with `includeExtensionMetadata`, `cost.estimated` should always be added to the result extensions even if no cost is calculated.

- Updated dependencies [[`88c9369`](https://github.com/graphql-hive/gateway/commit/88c9369abfdcb8e5ed8331c12a42a90e3b6b211b), [`b7627d3`](https://github.com/graphql-hive/gateway/commit/b7627d3cc29e54a048085a79a07a7906f2994173), [`ef0e24c`](https://github.com/graphql-hive/gateway/commit/ef0e24c55ed26320d139a83b1de5b75d5c1bfe4e), [`0512be3`](https://github.com/graphql-hive/gateway/commit/0512be32399268eb7926db48675ddb5763fd8578), [`b7627d3`](https://github.com/graphql-hive/gateway/commit/b7627d3cc29e54a048085a79a07a7906f2994173)]:
  - @graphql-mesh/fusion-runtime@0.11.13
  - @graphql-tools/executor-http@2.0.1
  - @graphql-tools/delegate@10.2.18
  - @graphql-tools/federation@3.2.2
  - @graphql-tools/stitch@9.4.23
  - @graphql-mesh/hmac-upstream-signature@1.2.27
  - @graphql-tools/batch-delegate@9.0.36
  - @graphql-tools/wrap@10.0.36

## 1.8.2

### Patch Changes

- [#1095](https://github.com/graphql-hive/gateway/pull/1095) [`2dc5fd8`](https://github.com/graphql-hive/gateway/commit/2dc5fd89a292811e7ea845d14e0ddacecfa83e9f) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Provide non-GraphQL upstream service responses to the retry mechanism configuration

- [#1088](https://github.com/graphql-hive/gateway/pull/1088) [`305dbc4`](https://github.com/graphql-hive/gateway/commit/305dbc4ce08f53508f400e8e2610cb32e68002bc) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Core plugins take priority over user plugins

- Updated dependencies [[`2dc5fd8`](https://github.com/graphql-hive/gateway/commit/2dc5fd89a292811e7ea845d14e0ddacecfa83e9f)]:
  - @graphql-mesh/fusion-runtime@0.11.12
  - @graphql-mesh/hmac-upstream-signature@1.2.27

## 1.8.1

### Patch Changes

- Updated dependencies [[`e6dfbcd`](https://github.com/graphql-hive/gateway/commit/e6dfbcd4d1d2ebbdb7c5454b691b1be2b9c466b3)]:
  - @graphql-mesh/fusion-runtime@0.11.11
  - @graphql-mesh/hmac-upstream-signature@1.2.27

## 1.8.0

### Minor Changes

- [#997](https://github.com/graphql-hive/gateway/pull/997) [`4cf75cb`](https://github.com/graphql-hive/gateway/commit/4cf75cbf1f14169826d1917532ee73ee45c002d5) Thanks [@ardatan](https://github.com/ardatan)! - - **BREAKING**: HTTP Executor no longer takes `serviceName` as an option.
  - Both HTTP executor and `@graphql-mesh/transport-http-callback` no longer handle `DOWNSTREAM_SERVICE_ERROR` error code with `serviceName`.
  - Gateway runtime handles subgraph errors on its own with `DOWNSTREAM_SERVICE_ERROR` error code and `serviceName` as a property. This behavior can be configured with `subgraphErrors` option of the `createGatewayRuntime` function or CLI config.

  ```ts
  subgraphError: {
     errorCode: 'DOWNSTREAM_SERVICE_ERROR', // or `false` to remove this code completely
     subgraphNameProp: 'serviceName' // or `false` to remove this prop completely
  }
  ```

### Patch Changes

- [#1015](https://github.com/graphql-hive/gateway/pull/1015) [`9a120c8`](https://github.com/graphql-hive/gateway/commit/9a120c85ac67654f63e374cf420ac4b73da21228) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`graphql-yoga@^5.13.3` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.13.3) (from `^5.13.2`, in `dependencies`)

- [#1045](https://github.com/graphql-hive/gateway/pull/1045) [`da47a0e`](https://github.com/graphql-hive/gateway/commit/da47a0effcc0e3c2b934bc97ab10e6e86ef8cd93) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  - Updated dependency [`@whatwg-node/server@^0.10.5` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.10.5) (from `^0.10.3`, in `dependencies`)
  - Updated dependency [`graphql-yoga@^5.13.4` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.13.4) (from `^5.13.3`, in `dependencies`)

- [#1045](https://github.com/graphql-hive/gateway/pull/1045) [`da47a0e`](https://github.com/graphql-hive/gateway/commit/da47a0effcc0e3c2b934bc97ab10e6e86ef8cd93) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Update graphql-yoga and whatwg-node packages

  In light of https://github.com/ardatan/whatwg-node/pull/2305. Please upgrade as soon as possible!

- [#1007](https://github.com/graphql-hive/gateway/pull/1007) [`f797304`](https://github.com/graphql-hive/gateway/commit/f797304fe27fb4174cea5a50d9869a91b08b5e0d) Thanks [@ardatan](https://github.com/ardatan)! - Support aliased imports for Demand Control directives such as;

  ```graphql
  extend schema @link(url: "...", import: [{ name: "@cost", as: "@myCost" }])
  ```

  So in this case, `@myCost` will be available in the schema as `@myCost` instead of `@cost`.

- [#960](https://github.com/graphql-hive/gateway/pull/960) [`0f70298`](https://github.com/graphql-hive/gateway/commit/0f70298d420766f56398a198d9d91c12884f033d) Thanks [@ardatan](https://github.com/ardatan)! - Fix the version property in the gateway runtime instance

- Updated dependencies [[`9a120c8`](https://github.com/graphql-hive/gateway/commit/9a120c85ac67654f63e374cf420ac4b73da21228), [`da47a0e`](https://github.com/graphql-hive/gateway/commit/da47a0effcc0e3c2b934bc97ab10e6e86ef8cd93), [`da47a0e`](https://github.com/graphql-hive/gateway/commit/da47a0effcc0e3c2b934bc97ab10e6e86ef8cd93), [`da47a0e`](https://github.com/graphql-hive/gateway/commit/da47a0effcc0e3c2b934bc97ab10e6e86ef8cd93), [`da47a0e`](https://github.com/graphql-hive/gateway/commit/da47a0effcc0e3c2b934bc97ab10e6e86ef8cd93), [`9a120c8`](https://github.com/graphql-hive/gateway/commit/9a120c85ac67654f63e374cf420ac4b73da21228), [`4cf75cb`](https://github.com/graphql-hive/gateway/commit/4cf75cbf1f14169826d1917532ee73ee45c002d5)]:
  - @graphql-mesh/fusion-runtime@0.11.10
  - @graphql-tools/executor-http@2.0.0
  - @graphql-tools/federation@3.2.1
  - @graphql-mesh/hmac-upstream-signature@1.2.27

## 1.7.0

### Minor Changes

- [#946](https://github.com/graphql-hive/gateway/pull/946) [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35) Thanks [@ardatan](https://github.com/ardatan)! - Request ID configuration;

  By default, first Hive Gateway was checking if `x-request-id` exists in the HTTP headers, then generates and sets a new one.
  And this can be disabled by setting `requestId` to `false` in the `gatewayConfig`.

  Now you can configure the request ID generation by providing a function to the `requestId` field in the `gatewayConfig` (or inherit from the framework you use).
  And you can also rename the header name by setting the `headerName` field in the `gatewayConfig`.

  ```ts
  import { defineConfig } from '@graphql-hive/gateway';

  export const gatewayConfig = defineConfig({
    requestId: {
      headerName: 'x-request-id',
      generateRequestId({ request, context, fetchAPI }) {
        return fetchAPI.crypto.randomUUID();
      },
    },
  });
  ```

  This is useful with Fastify because it handles the request ID generation and propagation by itself.

  ```ts
  const requestIdHeader = 'x-guild-request-id';

  const app = fastify({
    /** ... */
    requestIdHeader,
    // Align with Hive Gateway's request id log label
    requestIdLogLabel: 'requestId',
    genReqId(req) {
      if (req.headers[requestIdHeader]) {
        return req.headers[requestIdHeader].toString();
      }
      return crypto.randomUUID();
    },
  });

  const gateway = createGateway({
    /** ... */
    requestId: {
      headerName: requestIdHeader,
      generateRequestId({ request, context, fetchAPI }) {
        return request.id;
      },
    },
  });
  ```

### Patch Changes

- [#946](https://github.com/graphql-hive/gateway/pull/946) [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/utils@^0.104.2` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.104.2) (from `^0.104.1`, in `dependencies`)

- [#946](https://github.com/graphql-hive/gateway/pull/946) [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35) Thanks [@ardatan](https://github.com/ardatan)! - Log the information when an ongoing request is aborted and retried when a new schema is reloaded (mostly done by polling)

- [#946](https://github.com/graphql-hive/gateway/pull/946) [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35) Thanks [@ardatan](https://github.com/ardatan)! - Now all the messages from GraphOS fetcher are improved, it now includes details about attempts, which uplinks are in use, what errors are thrown etc.

- [#946](https://github.com/graphql-hive/gateway/pull/946) [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35) Thanks [@ardatan](https://github.com/ardatan)! - Simplify and make readable the logs printed by the readiness checks, now it uses `readiness` title and prints `passes` or `fails` with errors if present

- Updated dependencies [[`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35), [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35), [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35), [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35), [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35), [`c7ea2c5`](https://github.com/graphql-hive/gateway/commit/c7ea2c5ae71b6b338ef22edd927a3fc93803965f), [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35), [`0af3485`](https://github.com/graphql-hive/gateway/commit/0af3485abb1b3dfba4126f09d291b2096d23aa32)]:
  - @graphql-hive/logger-json@0.0.4
  - @graphql-mesh/fusion-runtime@0.11.9
  - @graphql-mesh/hmac-upstream-signature@1.2.26
  - @graphql-tools/federation@3.2.0
  - @graphql-tools/delegate@10.2.17
  - @graphql-tools/stitch@9.4.22
  - @graphql-mesh/transport-common@0.7.34
  - @graphql-tools/executor-http@1.3.3
  - @graphql-tools/batch-delegate@9.0.35
  - @graphql-tools/wrap@10.0.35

## 1.6.6

### Patch Changes

- [#933](https://github.com/graphql-hive/gateway/pull/933) [`a374bfc`](https://github.com/graphql-hive/gateway/commit/a374bfcf4309f5953b8c8304fba8e079b6f6b6dc) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  - Added dependency [`@graphql-hive/pubsub@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-hive/pubsub/v/workspace:^) (to `dependencies`)

- [#933](https://github.com/graphql-hive/gateway/pull/933) [`a374bfc`](https://github.com/graphql-hive/gateway/commit/a374bfcf4309f5953b8c8304fba8e079b6f6b6dc) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Dispose of PubSub on teardown if available

- Updated dependencies [[`a374bfc`](https://github.com/graphql-hive/gateway/commit/a374bfcf4309f5953b8c8304fba8e079b6f6b6dc), [`a374bfc`](https://github.com/graphql-hive/gateway/commit/a374bfcf4309f5953b8c8304fba8e079b6f6b6dc)]:
  - @graphql-mesh/transport-common@0.7.33
  - @graphql-hive/pubsub@1.0.0
  - @graphql-mesh/hmac-upstream-signature@1.2.25
  - @graphql-mesh/fusion-runtime@0.11.8

## 1.6.5

### Patch Changes

- [#940](https://github.com/graphql-hive/gateway/pull/940) [`ab96392`](https://github.com/graphql-hive/gateway/commit/ab96392b3561de62cf6a57280e4c3ac0ec98d88b) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Revert accidental OpenTelemetry potential breaking changes

- Updated dependencies [[`ab96392`](https://github.com/graphql-hive/gateway/commit/ab96392b3561de62cf6a57280e4c3ac0ec98d88b)]:
  - @graphql-mesh/hmac-upstream-signature@1.2.25
  - @graphql-mesh/fusion-runtime@0.11.7

## 1.6.4

### Patch Changes

- [#532](https://github.com/graphql-hive/gateway/pull/532) [`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - dependencies updates:
  - Updated dependency [`@whatwg-node/promise-helpers@^1.3.0` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.3.0) (from `^1.2.5`, in `dependencies`)
  - Updated dependency [`graphql-yoga@^5.13.2` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.13.2) (from `^5.13.1`, in `dependencies`)

- [#922](https://github.com/graphql-hive/gateway/pull/922) [`c9cd206`](https://github.com/graphql-hive/gateway/commit/c9cd20666a740514a5c17ecd6d0c000ad0dd7106) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  - Added dependency [`@graphql-hive/signal@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-hive/signal/v/workspace:^) (to `dependencies`)

- Updated dependencies [[`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04), [`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04), [`c9cd206`](https://github.com/graphql-hive/gateway/commit/c9cd20666a740514a5c17ecd6d0c000ad0dd7106), [`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04), [`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04), [`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04), [`c9cd206`](https://github.com/graphql-hive/gateway/commit/c9cd20666a740514a5c17ecd6d0c000ad0dd7106), [`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04), [`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04), [`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04), [`7b86c09`](https://github.com/graphql-hive/gateway/commit/7b86c097f5d424b82c84b87c743d5ed4ebe6aa5c), [`3003ae2`](https://github.com/graphql-hive/gateway/commit/3003ae2545148f75edf0ddca5e84c7b527176713), [`c9cd206`](https://github.com/graphql-hive/gateway/commit/c9cd20666a740514a5c17ecd6d0c000ad0dd7106), [`dbfb0f7`](https://github.com/graphql-hive/gateway/commit/dbfb0f7d6906d99b07b959bb6254d10e2fe2adf0)]:
  - @graphql-mesh/fusion-runtime@0.11.6
  - @graphql-mesh/hmac-upstream-signature@1.2.24
  - @graphql-mesh/transport-common@0.7.32
  - @graphql-tools/batch-delegate@9.0.34
  - @graphql-tools/delegate@10.2.16
  - @graphql-tools/executor-http@1.3.2
  - @graphql-tools/federation@3.1.7
  - @graphql-tools/stitch@9.4.21
  - @graphql-tools/wrap@10.0.34
  - @graphql-hive/signal@1.0.0

## 1.6.3

### Patch Changes

- [#910](https://github.com/graphql-hive/gateway/pull/910) [`1950f44`](https://github.com/graphql-hive/gateway/commit/1950f44d9180c8cd8a73917487c087ab1d1b74fa) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@whatwg-node/server@^0.10.2` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.10.2) (from `^0.10.1`, in `dependencies`)

- [#900](https://github.com/graphql-hive/gateway/pull/900) [`df1bce6`](https://github.com/graphql-hive/gateway/commit/df1bce649e3f468435aa34d9141b4c20d8d26699) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Dispose of Hive Console plugin on teardown

- [#900](https://github.com/graphql-hive/gateway/pull/900) [`df1bce6`](https://github.com/graphql-hive/gateway/commit/df1bce649e3f468435aa34d9141b4c20d8d26699) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Hive reporting usage clientInfo can be an object

- Updated dependencies []:
  - @graphql-mesh/hmac-upstream-signature@1.2.23

## 1.6.2

### Patch Changes

- [#862](https://github.com/graphql-hive/gateway/pull/862) [`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@whatwg-node/promise-helpers@^1.2.5` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.2.5) (from `^1.0.0`, in `dependencies`)

- [#862](https://github.com/graphql-hive/gateway/pull/862) [`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448) Thanks [@ardatan](https://github.com/ardatan)! - Improve webhooks handling

- Updated dependencies [[`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448), [`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448), [`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448), [`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448), [`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448), [`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448), [`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448), [`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448)]:
  - @graphql-mesh/fusion-runtime@0.11.5
  - @graphql-mesh/hmac-upstream-signature@1.2.23
  - @graphql-tools/batch-delegate@9.0.33
  - @graphql-tools/delegate@10.2.15
  - @graphql-tools/executor-http@1.3.1
  - @graphql-tools/federation@3.1.6
  - @graphql-tools/stitch@9.4.20
  - @graphql-tools/wrap@10.0.33

## 1.6.1

### Patch Changes

- [#838](https://github.com/graphql-hive/gateway/pull/838) [`b19309b`](https://github.com/graphql-hive/gateway/commit/b19309b450482c203b1c71fb5762320c7e5fa739) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Dispose of cache on teardown

- [#818](https://github.com/graphql-hive/gateway/pull/818) [`115a1f1`](https://github.com/graphql-hive/gateway/commit/115a1f16791e5de39b14a41b375d061113844a1b) Thanks [@ardatan](https://github.com/ardatan)! - When the schema is reloaded during a query execution, retry the request instead of throwing a reload event error

- Updated dependencies [[`115a1f1`](https://github.com/graphql-hive/gateway/commit/115a1f16791e5de39b14a41b375d061113844a1b)]:
  - @graphql-mesh/fusion-runtime@0.11.4
  - @graphql-mesh/hmac-upstream-signature@1.2.22

## 1.6.0

### Minor Changes

- [#809](https://github.com/graphql-hive/gateway/pull/809) [`17cfa19`](https://github.com/graphql-hive/gateway/commit/17cfa190bf7965681716e5e1ec601793a85935d8) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Introduce `target` as a new Hive reporting option

  [Read more on Hive's product update page.](https://the-guild.dev/graphql/hive/product-updates/2025-03-10-new-access-tokens)

### Patch Changes

- [#809](https://github.com/graphql-hive/gateway/pull/809) [`17cfa19`](https://github.com/graphql-hive/gateway/commit/17cfa190bf7965681716e5e1ec601793a85935d8) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  - Added dependency [`@graphql-hive/yoga@^0.41.0` ↗︎](https://www.npmjs.com/package/@graphql-hive/yoga/v/0.41.0) (to `dependencies`)
  - Removed dependency [`@graphql-mesh/plugin-hive@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-hive/v/0.104.0) (from `dependencies`)

- Updated dependencies []:
  - @graphql-mesh/hmac-upstream-signature@1.2.22

## 1.5.0

### Minor Changes

- [#745](https://github.com/graphql-hive/gateway/pull/745) [`bbc98c5`](https://github.com/graphql-hive/gateway/commit/bbc98c58277283f064ba826a3d844709f75ac451) Thanks [@ardatan](https://github.com/ardatan)! - **_New plugin/feature:_**
  Demand Control a.k.a. Cost Limit including the implementation of `@cost` and `@listSize` directives

  [See the documentation to learn more](https://the-guild.dev/graphql/hive/docs/gateway/other-features/security/demand-control)

- [#795](https://github.com/graphql-hive/gateway/pull/795) [`ee00eaf`](https://github.com/graphql-hive/gateway/commit/ee00eaf8cd843dacba20b9235033b62f061195f7) Thanks [@ardatan](https://github.com/ardatan)! - Use the same logging option handling logic, and export \`handleLoggingOption\` on runtime package

- [#795](https://github.com/graphql-hive/gateway/pull/795) [`ee00eaf`](https://github.com/graphql-hive/gateway/commit/ee00eaf8cd843dacba20b9235033b62f061195f7) Thanks [@ardatan](https://github.com/ardatan)! - Handle string value in `logging` like `logging: 'info'`

- [#743](https://github.com/graphql-hive/gateway/pull/743) [`e0d5feb`](https://github.com/graphql-hive/gateway/commit/e0d5feb156f896be5c5235eb1ae22144cf67eff9) Thanks [@ardatan](https://github.com/ardatan)! - New Cache related hooks;

  `onCacheGet`: invoked when a cache get operation is performed.
  `onCacheMiss`: invoked when the performed get operation does not find a cache entry.
  `onCacheHit`: invoked when the performed get operation finds a cache entry.
  `onCacheGetError`: invoked when an error occurs during a cache get operation.

  `onCacheSet`: invoked when a cache set operation is performed.
  `onCacheSetDone`: invoked when the performed set operation is completed.
  `onCacheSetError`: invoked when an error occurs during a cache set operation.

  `onCacheDelete`: invoked when a cache delete operation is performed.
  `onCacheDeleteDone`: invoked when the performed delete operation is completed.
  `onCacheDeleteError`: invoked when an error occurs during a cache delete operation.

### Patch Changes

- [#706](https://github.com/graphql-hive/gateway/pull/706) [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - dependencies updates:
  - Updated dependency [`@envelop/core@^5.2.3` ↗︎](https://www.npmjs.com/package/@envelop/core/v/5.2.3) (from `^5.1.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.104.1` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.104.1) (from `^0.104.0`, in `dependencies`)
  - Updated dependency [`@whatwg-node/server@^0.10.1` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.10.1) (from `^0.10.0`, in `dependencies`)
  - Updated dependency [`graphql-yoga@^5.13.1` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.13.1) (from `^5.12.0`, in `dependencies`)

- [#726](https://github.com/graphql-hive/gateway/pull/726) [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Added dependency [`@whatwg-node/promise-helpers@^1.0.0` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.0.0) (to `dependencies`)

- [#727](https://github.com/graphql-hive/gateway/pull/727) [`c54a080`](https://github.com/graphql-hive/gateway/commit/c54a080b8b9c477ed55dd7c23fc8fcae9139bec8) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@whatwg-node/disposablestack@^0.0.6` ↗︎](https://www.npmjs.com/package/@whatwg-node/disposablestack/v/0.0.6) (from `^0.0.5`, in `dependencies`)

- [#770](https://github.com/graphql-hive/gateway/pull/770) [`f974f5b`](https://github.com/graphql-hive/gateway/commit/f974f5b22fb6a0f1a6d605eac69d94ad90357a9c) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@whatwg-node/server@^0.10.0` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.10.0) (from `^0.9.68`, in `dependencies`)

- [#771](https://github.com/graphql-hive/gateway/pull/771) [`ff6dcaf`](https://github.com/graphql-hive/gateway/commit/ff6dcafbb226d66cc95f29e7287b4ca4eb4e9f8d) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.8.0` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.8.0) (from `^0.7.1`, in `dependencies`)

- [#775](https://github.com/graphql-hive/gateway/pull/775) [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/plugin-hive@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-hive/v/0.104.0) (from `^0.103.19`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-response-cache@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-response-cache/v/0.104.0) (from `^0.103.21`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.104.0) (from `^0.103.18`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.104.0) (from `^0.103.18`, in `dependencies`)

- [#799](https://github.com/graphql-hive/gateway/pull/799) [`6cef6f0`](https://github.com/graphql-hive/gateway/commit/6cef6f0d6389b5521900d220a1d0ff1bee8158b6) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-hive/core@^0.10.0` ↗︎](https://www.npmjs.com/package/@graphql-hive/core/v/0.10.0) (from `^0.9.0`, in `dependencies`)

- [#806](https://github.com/graphql-hive/gateway/pull/806) [`b145a27`](https://github.com/graphql-hive/gateway/commit/b145a27fc8671f33c36f9f6a3a437d80107631ee) Thanks [@ardatan](https://github.com/ardatan)! - Fix `contentEncoding` type in `defineConfig`

- [#792](https://github.com/graphql-hive/gateway/pull/792) [`9c2f323`](https://github.com/graphql-hive/gateway/commit/9c2f323ece47d9c0ef8f4e44050390096ceac17f) Thanks [@ardatan](https://github.com/ardatan)! - Ensure subgraph name is present in the upstream error extensions when HTTP Executor throws

- [#766](https://github.com/graphql-hive/gateway/pull/766) [`717b293`](https://github.com/graphql-hive/gateway/commit/717b29326b1b1a8d6b0ef399205b44eca123e648) Thanks [@ardatan](https://github.com/ardatan)! - Respect `lastSeenId` while fetching the supergraph from GraphOS instead of leaving the comparison to the runtime

- Updated dependencies [[`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`c54a080`](https://github.com/graphql-hive/gateway/commit/c54a080b8b9c477ed55dd7c23fc8fcae9139bec8), [`002fc95`](https://github.com/graphql-hive/gateway/commit/002fc95c446470943de4d0ef1457850277c3d8aa), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`c54a080`](https://github.com/graphql-hive/gateway/commit/c54a080b8b9c477ed55dd7c23fc8fcae9139bec8), [`d949143`](https://github.com/graphql-hive/gateway/commit/d94914302b5b2c71b1c95df5145326fba89b023c), [`661b103`](https://github.com/graphql-hive/gateway/commit/661b103a7b9586641e69b78cbaad516e550e7192), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`c54a080`](https://github.com/graphql-hive/gateway/commit/c54a080b8b9c477ed55dd7c23fc8fcae9139bec8), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`9c2f323`](https://github.com/graphql-hive/gateway/commit/9c2f323ece47d9c0ef8f4e44050390096ceac17f), [`0451e82`](https://github.com/graphql-hive/gateway/commit/0451e82446a83a17f9fd4b285da240fb00f1c162), [`2a54e85`](https://github.com/graphql-hive/gateway/commit/2a54e85f2848aea7525703ea33918a21db96b26b)]:
  - @graphql-hive/logger-json@0.0.3
  - @graphql-mesh/fusion-runtime@0.11.3
  - @graphql-mesh/hmac-upstream-signature@1.2.22
  - @graphql-mesh/transport-common@0.7.31
  - @graphql-tools/batch-delegate@9.0.32
  - @graphql-tools/delegate@10.2.14
  - @graphql-tools/executor-common@0.0.4
  - @graphql-tools/executor-http@1.3.0
  - @graphql-tools/federation@3.1.5
  - @graphql-tools/stitch@9.4.19
  - @graphql-tools/wrap@10.0.32

## 1.4.17

### Patch Changes

- [#686](https://github.com/graphql-hive/gateway/pull/686) [`0ff5c55`](https://github.com/graphql-hive/gateway/commit/0ff5c55501ac766057cd3290dd5ec73093438764) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@envelop/disable-introspection@^7.0.0` ↗︎](https://www.npmjs.com/package/@envelop/disable-introspection/v/7.0.0) (from `^6.0.0`, in `dependencies`)
  - Updated dependency [`@envelop/generic-auth@^9.0.0` ↗︎](https://www.npmjs.com/package/@envelop/generic-auth/v/9.0.0) (from `^8.0.0`, in `dependencies`)

- [#689](https://github.com/graphql-hive/gateway/pull/689) [`40f5d1d`](https://github.com/graphql-hive/gateway/commit/40f5d1d1765de020e0486a392a2223d8d83a9962) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.7.0` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.7.0) (from `^0.6.0`, in `dependencies`)

- [#695](https://github.com/graphql-hive/gateway/pull/695) [`2e3ce14`](https://github.com/graphql-hive/gateway/commit/2e3ce1423049553d5cb1d14645295c5f04b96c85) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Removed dependency [`@parcel/watcher@^2.1.0` ↗︎](https://www.npmjs.com/package/@parcel/watcher/v/2.1.0) (from `peerDependencies`)

- [#696](https://github.com/graphql-hive/gateway/pull/696) [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@envelop/core@^5.1.0` ↗︎](https://www.npmjs.com/package/@envelop/core/v/5.1.0) (from `^5.0.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.10` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.10) (from `^0.4.9`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-hive@^0.103.19` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-hive/v/0.103.19) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-response-cache@^0.103.21` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-response-cache/v/0.103.21) (from `^0.103.13`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.18) (from `^0.103.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.18) (from `^0.103.6`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.7.1` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.7.1) (from `^0.7.0`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-csrf-prevention@^3.12.0` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-csrf-prevention/v/3.12.0) (from `^3.10.6`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-defer-stream@^3.12.0` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-defer-stream/v/3.12.0) (from `^3.10.6`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-persisted-operations@^3.12.0` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-persisted-operations/v/3.12.0) (from `^3.10.6`, in `dependencies`)
  - Updated dependency [`@whatwg-node/server@^0.9.68` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.9.68) (from `^0.9.60`, in `dependencies`)
  - Updated dependency [`graphql-ws@^6.0.4` ↗︎](https://www.npmjs.com/package/graphql-ws/v/6.0.4) (from `^6.0.3`, in `dependencies`)
  - Updated dependency [`graphql-yoga@^5.12.0` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.12.0) (from `^5.10.11`, in `dependencies`)

- [#681](https://github.com/graphql-hive/gateway/pull/681) [`a9395eb`](https://github.com/graphql-hive/gateway/commit/a9395eb29b25c795701642176243b3aac629dbef) Thanks [@ardatan](https://github.com/ardatan)! - Log Fetch calls, subgraph execution and delegation plan generation after all other plugins are invoked

- Updated dependencies [[`6cc87c6`](https://github.com/graphql-hive/gateway/commit/6cc87c6e9aa0cbb9eff517eeec92d57b9c96d39e), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`20d275c`](https://github.com/graphql-hive/gateway/commit/20d275cd1badf76665874492d4550a7732b46f62)]:
  - @graphql-hive/logger-json@0.0.2
  - @graphql-mesh/fusion-runtime@0.11.2
  - @graphql-mesh/hmac-upstream-signature@1.2.21
  - @graphql-mesh/transport-common@0.7.30
  - @graphql-tools/executor-common@0.0.3
  - @graphql-tools/executor-http@1.2.8
  - @graphql-tools/federation@3.1.4

## 1.4.15

### Patch Changes

- Updated dependencies [[`2318393`](https://github.com/graphql-hive/gateway/commit/2318393bc7b3aca7f53806a44b59277cd176702d)]:
  - @graphql-tools/delegate@10.2.13
  - @graphql-tools/batch-delegate@9.0.31
  - @graphql-tools/federation@3.1.3
  - @graphql-mesh/fusion-runtime@0.11.1
  - @graphql-tools/stitch@9.4.18
  - @graphql-tools/wrap@10.0.31
  - @graphql-mesh/hmac-upstream-signature@1.2.20

## 1.4.14

### Patch Changes

- [#654](https://github.com/graphql-hive/gateway/pull/654) [`36b1baf`](https://github.com/graphql-hive/gateway/commit/36b1bafdcded06dc3d7a2166b7a39988d07af817) Thanks [@ardatan](https://github.com/ardatan)! - Expose `agentVersion`, `clientName` and `clientVersion` options for GraphOS reporting

  And set `hive-gateway@VERSION` by default for `agentVersion`

- Updated dependencies []:
  - @graphql-mesh/hmac-upstream-signature@1.2.20

## 1.4.13

### Patch Changes

- [#610](https://github.com/graphql-hive/gateway/pull/610) [`260faaf`](https://github.com/graphql-hive/gateway/commit/260faafa26598066ee95ee501858998483d46e1f) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.6.0` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.6.0) (from `^0.5.9`, in `dependencies`)

- [#620](https://github.com/graphql-hive/gateway/pull/620) [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-tools/utils@^10.8.1` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.8.1) (from `^10.7.0`, in `dependencies`)

- [#623](https://github.com/graphql-hive/gateway/pull/623) [`4c82bb1`](https://github.com/graphql-hive/gateway/commit/4c82bb176c230d46fd69747c1b83a0d0a400eddb) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-hive/core@^0.9.0` ↗︎](https://www.npmjs.com/package/@graphql-hive/core/v/0.9.0) (from `^0.8.1`, in `dependencies`)

- [#642](https://github.com/graphql-hive/gateway/pull/642) [`30e41a6`](https://github.com/graphql-hive/gateway/commit/30e41a6f5b97c42ae548564bce3f6e4a92b1225f) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Added dependency [`@graphql-hive/logger-json@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-hive/logger-json/v/workspace:^) (to `dependencies`)

- [#642](https://github.com/graphql-hive/gateway/pull/642) [`30e41a6`](https://github.com/graphql-hive/gateway/commit/30e41a6f5b97c42ae548564bce3f6e4a92b1225f) Thanks [@ardatan](https://github.com/ardatan)! - New JSON-based logger

  By default, it prints pretty still to the console unless NODE_ENV is production.
  For JSON output, set the `LOG_FORMAT` environment variable to `json`.

- Updated dependencies [[`e5d77f3`](https://github.com/graphql-hive/gateway/commit/e5d77f3aa177b50ea0ba2f37e02e3f87794f512e), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`30e41a6`](https://github.com/graphql-hive/gateway/commit/30e41a6f5b97c42ae548564bce3f6e4a92b1225f), [`e5d77f3`](https://github.com/graphql-hive/gateway/commit/e5d77f3aa177b50ea0ba2f37e02e3f87794f512e), [`7146f8d`](https://github.com/graphql-hive/gateway/commit/7146f8decca808ab2c68f4971ba9b64ca27a9b87), [`7146f8d`](https://github.com/graphql-hive/gateway/commit/7146f8decca808ab2c68f4971ba9b64ca27a9b87)]:
  - @graphql-mesh/fusion-runtime@0.11.0
  - @graphql-mesh/hmac-upstream-signature@1.2.20
  - @graphql-mesh/transport-common@0.7.29
  - @graphql-tools/batch-delegate@9.0.30
  - @graphql-tools/delegate@10.2.12
  - @graphql-tools/executor-common@0.0.2
  - @graphql-tools/executor-http@1.2.7
  - @graphql-tools/federation@3.1.2
  - @graphql-tools/stitch@9.4.17
  - @graphql-tools/wrap@10.0.30
  - @graphql-hive/logger-json@0.0.1

## 1.4.12

### Patch Changes

- [#598](https://github.com/graphql-hive/gateway/pull/598) [`8c80ac9`](https://github.com/graphql-hive/gateway/commit/8c80ac98cd5afd7c063945f4704fe4866622c5d7) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Removed dependency [`@graphql-hive/gateway-abort-signal-any@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-hive/gateway-abort-signal-any/v/workspace:^) (from `dependencies`)

- [#598](https://github.com/graphql-hive/gateway/pull/598) [`8c80ac9`](https://github.com/graphql-hive/gateway/commit/8c80ac98cd5afd7c063945f4704fe4866622c5d7) Thanks [@ardatan](https://github.com/ardatan)! - Use native AbortSignal, AbortController APIs instead of custom ones

- Updated dependencies [[`8c80ac9`](https://github.com/graphql-hive/gateway/commit/8c80ac98cd5afd7c063945f4704fe4866622c5d7), [`8c80ac9`](https://github.com/graphql-hive/gateway/commit/8c80ac98cd5afd7c063945f4704fe4866622c5d7), [`8c80ac9`](https://github.com/graphql-hive/gateway/commit/8c80ac98cd5afd7c063945f4704fe4866622c5d7), [`203172c`](https://github.com/graphql-hive/gateway/commit/203172c479f764bf09f447512f8904277bff0b20)]:
  - @graphql-mesh/transport-common@0.7.28
  - @graphql-tools/executor-http@1.2.6
  - @graphql-mesh/fusion-runtime@0.10.32
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-tools/federation@3.1.1

## 1.4.11

### Patch Changes

- [#481](https://github.com/graphql-hive/gateway/pull/481) [`0b13cb4`](https://github.com/graphql-hive/gateway/commit/0b13cb472305edd01cdbd964a71995831797305e) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  - Updated dependency [`graphql-ws@^6.0.3` ↗︎](https://www.npmjs.com/package/graphql-ws/v/6.0.3) (from `^5.16.0`, in `dependencies`)

- Updated dependencies []:
  - @graphql-mesh/hmac-upstream-signature@1.2.19

## 1.4.10

### Patch Changes

- [#538](https://github.com/graphql-hive/gateway/pull/538) [`aab5441`](https://github.com/graphql-hive/gateway/commit/aab544176983e241c62f15242a35ca1398efa044) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`graphql-yoga@^5.10.11` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.10.11) (from `^5.10.6`, in `dependencies`)

- [#549](https://github.com/graphql-hive/gateway/pull/549) [`46888f1`](https://github.com/graphql-hive/gateway/commit/46888f1202cfb300b540b78199250b0b426c069d) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  - Added dependency [`graphql-ws@^5.16.0` ↗︎](https://www.npmjs.com/package/graphql-ws/v/5.16.0) (to `dependencies`)

- [#557](https://github.com/graphql-hive/gateway/pull/557) [`180c2c4`](https://github.com/graphql-hive/gateway/commit/180c2c43218027600d3ad6ce74b413ad7621d427) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/plugin-response-cache@^0.103.13` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-response-cache/v/0.103.13) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.5.9` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.5.9) (from `^0.5.3`, in `dependencies`)

- [#549](https://github.com/graphql-hive/gateway/pull/549) [`46888f1`](https://github.com/graphql-hive/gateway/commit/46888f1202cfb300b540b78199250b0b426c069d) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Export `getGraphQLWSOptions` function that creates `graphql-ws` for the Hive Gateway

  Allowing the users to correctly set up WebSockets when using the Hive Gateway programmatically.

- [#447](https://github.com/graphql-hive/gateway/pull/447) [`61f387c`](https://github.com/graphql-hive/gateway/commit/61f387c8a1e18a5d7a37cd33afb428488ac13aed) Thanks [@ardatan](https://github.com/ardatan)! - Improve GraphOS supergraph fetching;
  - Handle `minDelaySeconds` correctly, before retrying the supergraph request, wait for the `minDelaySeconds` to pass.
  - Respect `maxRetries` (which is the maximum of the number of available uplink endpoints and 3) when fetching the supergraph.
  - Try all possible uplinks before failing the supergraph request.

- Updated dependencies [[`aab5441`](https://github.com/graphql-hive/gateway/commit/aab544176983e241c62f15242a35ca1398efa044), [`b52c9ba`](https://github.com/graphql-hive/gateway/commit/b52c9ba47f84d0905f1f63fdfe071c891dce5b7f), [`9144222`](https://github.com/graphql-hive/gateway/commit/91442220b2242a0fa082d4b544d03621572eecd0), [`b0bc26b`](https://github.com/graphql-hive/gateway/commit/b0bc26b8e18a2e61e5fa96f48cd77820e3598b52)]:
  - @graphql-mesh/fusion-runtime@0.10.31
  - @graphql-tools/federation@3.1.0
  - @graphql-tools/delegate@10.2.11
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-tools/batch-delegate@9.0.29
  - @graphql-tools/stitch@9.4.16
  - @graphql-tools/wrap@10.0.29

## 1.4.9

### Patch Changes

- Updated dependencies [[`18682e6`](https://github.com/graphql-hive/gateway/commit/18682e6873091afe63f09414f02f93649a4da141), [`e9f78cd`](https://github.com/graphql-hive/gateway/commit/e9f78cd29681ca9b4371e12953a31d2b8f5e4c17)]:
  - @graphql-tools/delegate@10.2.10
  - @graphql-tools/wrap@10.0.28
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-tools/batch-delegate@9.0.28
  - @graphql-tools/federation@3.0.10
  - @graphql-mesh/fusion-runtime@0.10.30
  - @graphql-tools/stitch@9.4.15

## 1.4.8

### Patch Changes

- [#420](https://github.com/graphql-hive/gateway/pull/420) [`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Added dependency [`@graphql-tools/executor-common@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-tools/executor-common/v/workspace:^) (to `dependencies`)

- [#420](https://github.com/graphql-hive/gateway/pull/420) [`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92) Thanks [@ardatan](https://github.com/ardatan)! - - In case of schema reload, throw `SCHEMA_RELOAD` error while recreating the transports and executors
  - In case of shut down, throw `SHUTTING_DOWN` error while cleaning the transports and executors up

  Previously, these errors are only thrown for subscriptions not it is thrown in other type of operations as well.
  And previously the thrown errors during these two cleanup and restart process were cryptic, now the mentioned two errors above are thrown with more clear messages

- [#420](https://github.com/graphql-hive/gateway/pull/420) [`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92) Thanks [@ardatan](https://github.com/ardatan)! - Leave the supergraph configuration handling logic to fusion-runtime package so it can compare bare read supergraph sdl directly inside unified graph manager to decide if the supergraph has changed.

- Updated dependencies [[`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92), [`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92), [`a625269`](https://github.com/graphql-hive/gateway/commit/a62526936680d030339fc26cc55d76507134b022), [`a625269`](https://github.com/graphql-hive/gateway/commit/a62526936680d030339fc26cc55d76507134b022), [`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92), [`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92)]:
  - @graphql-mesh/fusion-runtime@0.10.29
  - @graphql-mesh/transport-common@0.7.27
  - @graphql-tools/stitch@9.4.14
  - @graphql-tools/federation@3.0.9
  - @graphql-tools/executor-http@1.2.5
  - @graphql-mesh/hmac-upstream-signature@1.2.19

## 1.4.7

### Patch Changes

- Updated dependencies [[`0591aa9`](https://github.com/graphql-hive/gateway/commit/0591aa9cc9718a1c7d8b6fa68723a3155f775cc7)]:
  - @graphql-tools/federation@3.0.8
  - @graphql-mesh/fusion-runtime@0.10.28
  - @graphql-mesh/hmac-upstream-signature@1.2.19

## 1.4.6

### Patch Changes

- Updated dependencies [[`c60a8f4`](https://github.com/graphql-hive/gateway/commit/c60a8f446c5ca59a74a580050f5c20c0c9e61e97), [`3571399`](https://github.com/graphql-hive/gateway/commit/35713997b5330989b001c6317631621af24c404b), [`da65b2d`](https://github.com/graphql-hive/gateway/commit/da65b2d8a66714fb5a135e66ebbe59fa37182600)]:
  - @graphql-hive/gateway-abort-signal-any@0.0.3
  - @graphql-tools/federation@3.0.7
  - @graphql-tools/batch-delegate@9.0.27
  - @graphql-tools/executor-http@1.2.4
  - @graphql-mesh/transport-common@0.7.26
  - @graphql-mesh/fusion-runtime@0.10.27
  - @graphql-tools/stitch@9.4.13
  - @graphql-mesh/hmac-upstream-signature@1.2.19

## 1.4.5

### Patch Changes

- Updated dependencies [[`21e1f05`](https://github.com/graphql-hive/gateway/commit/21e1f05373a78c93b52b5321f1f4e8d7aba17151)]:
  - @graphql-tools/batch-delegate@9.0.26
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-tools/stitch@9.4.12
  - @graphql-tools/federation@3.0.6
  - @graphql-mesh/fusion-runtime@0.10.26

## 1.4.4

### Patch Changes

- Updated dependencies [[`55eb1b4`](https://github.com/graphql-hive/gateway/commit/55eb1b4d14aec7b3e6c7bcf9f596bc01192d022c), [`55eb1b4`](https://github.com/graphql-hive/gateway/commit/55eb1b4d14aec7b3e6c7bcf9f596bc01192d022c), [`55eb1b4`](https://github.com/graphql-hive/gateway/commit/55eb1b4d14aec7b3e6c7bcf9f596bc01192d022c), [`55eb1b4`](https://github.com/graphql-hive/gateway/commit/55eb1b4d14aec7b3e6c7bcf9f596bc01192d022c)]:
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-mesh/transport-common@0.7.25
  - @graphql-tools/executor-http@1.2.3
  - @graphql-mesh/fusion-runtime@0.10.25
  - @graphql-tools/federation@3.0.5

## 1.4.3

### Patch Changes

- [#373](https://github.com/graphql-hive/gateway/pull/373) [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@graphql-tools/utils@^10.7.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.7.0) (from `^10.6.2`, in `dependencies`)

- [#367](https://github.com/graphql-hive/gateway/pull/367) [`15975c2`](https://github.com/graphql-hive/gateway/commit/15975c28daddbb4f31d520371f53520aecacaac7) Thanks [@ardatan](https://github.com/ardatan)! - Fix the combination of `upstreamRetry` and `upstreamTimeout` together

  When you use `upstreamRetry` and `upstreamTimeout` together, the `upstreamRetry` wasn't applied properly when the request is timed out with `upstreamTimeout`.

- [#373](https://github.com/graphql-hive/gateway/pull/373) [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2) Thanks [@ardatan](https://github.com/ardatan)! - Use `registerAbortSignalListener` helper function to register event listeners to `AbortSignal` instances to avoid warning on Node.js like
  `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 abort listeners added. Use emitter.setMaxListeners() to increase limit`.
- Updated dependencies [[`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`15975c2`](https://github.com/graphql-hive/gateway/commit/15975c28daddbb4f31d520371f53520aecacaac7), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2)]:
  - @graphql-hive/gateway-abort-signal-any@0.0.2
  - @graphql-mesh/fusion-runtime@0.10.24
  - @graphql-mesh/hmac-upstream-signature@1.2.18
  - @graphql-mesh/transport-common@0.7.24
  - @graphql-tools/batch-delegate@9.0.25
  - @graphql-tools/delegate@10.2.9
  - @graphql-tools/executor-http@1.2.2
  - @graphql-tools/federation@3.0.4
  - @graphql-tools/stitch@9.4.11
  - @graphql-tools/wrap@10.0.27

## 1.4.2

### Patch Changes

- [#357](https://github.com/graphql-hive/gateway/pull/357) [`8b64103`](https://github.com/graphql-hive/gateway/commit/8b64103324d82c4934ff459ea644276bafbcda17) Thanks [@ardatan](https://github.com/ardatan)! - Fix the bug on setting the default polling interval to 10 seconds
  So by default, the gateway will poll the schema every 10 seconds, and update the schema if it has changed.

  This PR also contains improvements on logging about polling

- [#356](https://github.com/graphql-hive/gateway/pull/356) [`122c013`](https://github.com/graphql-hive/gateway/commit/122c0133bea6137b1760b4af064de9aeba53bcc5) Thanks [@ardatan](https://github.com/ardatan)! - Better messages on debug logs of readiness check endpoint;

  Before;
  On successful readiness check, the gateway was logging the following message:

  ```
  Readiness check passed: Supergraph loaded
  ```

  Because this makes the users think it was just loaded.
  After;
  On successful readiness check, the gateway will log the following message:

  ```
  Readiness check passed because supergraph has been loaded already
  ```

  On failed readiness check, the gateway was logging the following message:
  Before;

  ```
  Readiness check failed: Supergraph not loaded
  ```

  It should make the users think it was not loaded or there is an issue with the supergraph.

  After;

  ```
  Readiness check failed because supergraph has not been loaded yet or failed to load
  ```

- [#342](https://github.com/graphql-hive/gateway/pull/342) [`2f59fce`](https://github.com/graphql-hive/gateway/commit/2f59fce8aece4a326b20d4a9db2ee53773675e70) Thanks [@ardatan](https://github.com/ardatan)! - `token` doesn't need to be required for Hive reporting in the configuration because it can be provided by the arguments

- Updated dependencies [[`8b64103`](https://github.com/graphql-hive/gateway/commit/8b64103324d82c4934ff459ea644276bafbcda17)]:
  - @graphql-mesh/fusion-runtime@0.10.23
  - @graphql-mesh/hmac-upstream-signature@1.2.17

## 1.4.1

### Patch Changes

- [#333](https://github.com/graphql-hive/gateway/pull/333) [`0d81307`](https://github.com/graphql-hive/gateway/commit/0d813079753e7c66158499e2db6e301a3c145856) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.5.3` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.5.3) (from `^0.5.0`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-csrf-prevention@^3.10.6` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-csrf-prevention/v/3.10.6) (from `^3.7.0`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-defer-stream@^3.10.6` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-defer-stream/v/3.10.6) (from `^3.7.0`, in `dependencies`)
  - Updated dependency [`@graphql-yoga/plugin-persisted-operations@^3.10.6` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-persisted-operations/v/3.10.6) (from `^3.7.0`, in `dependencies`)
  - Updated dependency [`graphql-yoga@^5.10.6` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.10.6) (from `^5.10.4`, in `dependencies`)

- Updated dependencies [[`0d81307`](https://github.com/graphql-hive/gateway/commit/0d813079753e7c66158499e2db6e301a3c145856), [`0d81307`](https://github.com/graphql-hive/gateway/commit/0d813079753e7c66158499e2db6e301a3c145856)]:
  - @graphql-mesh/fusion-runtime@0.10.22
  - @graphql-tools/federation@3.0.3
  - @graphql-mesh/hmac-upstream-signature@1.2.17

## 1.4.0

### Minor Changes

- [#322](https://github.com/graphql-hive/gateway/pull/322) [`23b8987`](https://github.com/graphql-hive/gateway/commit/23b89874fcf10b4cb6b1b941f29fa5f5aecf0ef2) Thanks [@ardatan](https://github.com/ardatan)! - New Retry and Timeout plugins;
  - Retry plugin: Retry a request if it fails

  It respects the `Retry-After` HTTP header, [See more about this HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After)

  ```ts
  export const gatewayConfig = defineConfig({
      upstreamRetry: {
          // The maximum number of retries to attempt.
          maxRetries: 3, // required
          // The delay between retries in milliseconds.
          retryDelay: 1000, // default
          /**
           * A function that determines whether a response should be retried.
           * If the upstream returns `Retry-After` header, the request will be retried.
           */
          shouldRetry: ({ response }) => response?.status >= 500 || response?.status === 429
      }
      // or you can configure it by subgraph name
      upstreamRetry({ subgraphName }) {
          if (subgraphName === 'my-rate-limited-subgraph') {
              return {
                  maxRetries: 3,
              }
          }
          return { maxRetries: 10 }
      }
  })
  ```

  - Timeout plugin: Timeout a request if it takes too long

  ```ts
  export const gatewayConfig = defineConfig({
    // The maximum time in milliseconds to wait for a response from the upstream.
    upstreamTimeout: 1000, // required
    // or you can configure it by subgraph name
    upstreamTimeout({ subgraphName }) {
      if (subgraphName === 'my-slow-subgraph') {
        return 1000;
      }
    },
  });
  ```

### Patch Changes

- [#322](https://github.com/graphql-hive/gateway/pull/322) [`23b8987`](https://github.com/graphql-hive/gateway/commit/23b89874fcf10b4cb6b1b941f29fa5f5aecf0ef2) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Added dependency [`@graphql-hive/gateway-abort-signal-any@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-hive/gateway-abort-signal-any/v/workspace:^) (to `dependencies`)

- Updated dependencies [[`23b8987`](https://github.com/graphql-hive/gateway/commit/23b89874fcf10b4cb6b1b941f29fa5f5aecf0ef2), [`23b8987`](https://github.com/graphql-hive/gateway/commit/23b89874fcf10b4cb6b1b941f29fa5f5aecf0ef2), [`23b8987`](https://github.com/graphql-hive/gateway/commit/23b89874fcf10b4cb6b1b941f29fa5f5aecf0ef2), [`23b8987`](https://github.com/graphql-hive/gateway/commit/23b89874fcf10b4cb6b1b941f29fa5f5aecf0ef2)]:
  - @graphql-mesh/transport-common@0.7.23
  - @graphql-tools/delegate@10.2.8
  - @graphql-tools/executor-http@1.2.1
  - @graphql-hive/gateway-abort-signal-any@0.0.1
  - @graphql-mesh/fusion-runtime@0.10.21
  - @graphql-mesh/hmac-upstream-signature@1.2.17
  - @graphql-tools/batch-delegate@9.0.24
  - @graphql-tools/federation@3.0.2
  - @graphql-tools/stitch@9.4.10
  - @graphql-tools/wrap@10.0.26

## 1.3.15

### Patch Changes

- Updated dependencies [[`367b359`](https://github.com/graphql-hive/gateway/commit/367b3593cb7fd51c42ef4a13ab4adac202845734)]:
  - @graphql-tools/executor-http@1.2.0
  - @graphql-tools/federation@3.0.1
  - @graphql-mesh/fusion-runtime@0.10.20
  - @graphql-mesh/hmac-upstream-signature@1.2.16

## 1.3.14

### Patch Changes

- Updated dependencies [[`d747d4c`](https://github.com/graphql-hive/gateway/commit/d747d4cd37317e8a9b2b95a5270c0fbd47e4cba3), [`d747d4c`](https://github.com/graphql-hive/gateway/commit/d747d4cd37317e8a9b2b95a5270c0fbd47e4cba3)]:
  - @graphql-tools/federation@3.0.0
  - @graphql-mesh/fusion-runtime@0.10.19
  - @graphql-mesh/hmac-upstream-signature@1.2.16

## 1.3.13

### Patch Changes

- [#293](https://github.com/graphql-hive/gateway/pull/293) [`21ac43e`](https://github.com/graphql-hive/gateway/commit/21ac43eaa46a704a8ffc91398d01240fb2f4b33a) Thanks [@ardatan](https://github.com/ardatan)! - Fixes the bug when the fetcher given in subgraph called multiple times, so in the CLI when you point to a file for subgraph file, it fetches the subgraph on each request.

- Updated dependencies []:
  - @graphql-mesh/hmac-upstream-signature@1.2.16

## 1.3.12

### Patch Changes

- [#291](https://github.com/graphql-hive/gateway/pull/291) [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.9` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.9) (from `^0.4.8`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.6) (from `^0.103.4`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.6) (from `^0.103.4`, in `dependencies`)
  - Updated dependency [`graphql-yoga@^5.10.4` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.10.4) (from `^5.10.3`, in `dependencies`)
  - Updated dependency [`tslib@^2.8.1` ↗︎](https://www.npmjs.com/package/tslib/v/2.8.1) (from `^2.8.0`, in `dependencies`)

- Updated dependencies [[`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151)]:
  - @graphql-mesh/fusion-runtime@0.10.18
  - @graphql-mesh/hmac-upstream-signature@1.2.16
  - @graphql-mesh/transport-common@0.7.22
  - @graphql-tools/batch-delegate@9.0.23
  - @graphql-tools/delegate@10.2.7
  - @graphql-tools/executor-http@1.1.14
  - @graphql-tools/federation@2.2.40
  - @graphql-tools/stitch@9.4.9
  - @graphql-tools/wrap@10.0.25

## 1.3.11

### Patch Changes

- Updated dependencies [[`3b901c6`](https://github.com/graphql-hive/gateway/commit/3b901c66eabd076add8ed90709d34a1cc39c58f3)]:
  - @graphql-mesh/fusion-runtime@0.10.17
  - @graphql-mesh/hmac-upstream-signature@1.2.15

## 1.3.10

### Patch Changes

- [#286](https://github.com/graphql-hive/gateway/pull/286) [`ed9e205`](https://github.com/graphql-hive/gateway/commit/ed9e205adf705f31b6ae85ce4ad7a8eb0b30fe32) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Removed dependency [`@graphql-mesh/store@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/store/v/0.103.4) (from `dependencies`)

- Updated dependencies [[`ed9e205`](https://github.com/graphql-hive/gateway/commit/ed9e205adf705f31b6ae85ce4ad7a8eb0b30fe32), [`ed9e205`](https://github.com/graphql-hive/gateway/commit/ed9e205adf705f31b6ae85ce4ad7a8eb0b30fe32)]:
  - @graphql-mesh/fusion-runtime@0.10.16
  - @graphql-mesh/hmac-upstream-signature@1.2.15

## 1.3.9

### Patch Changes

- Updated dependencies [[`f2e0ae2`](https://github.com/graphql-hive/gateway/commit/f2e0ae2162f3fd3f1b2d3eefb6a21410c840db1b), [`f2e0ae2`](https://github.com/graphql-hive/gateway/commit/f2e0ae2162f3fd3f1b2d3eefb6a21410c840db1b)]:
  - @graphql-mesh/fusion-runtime@0.10.15
  - @graphql-mesh/hmac-upstream-signature@1.2.14

## 1.3.8

### Patch Changes

- Updated dependencies [[`3f1a0fa`](https://github.com/graphql-hive/gateway/commit/3f1a0fa9f1f3b91542d00a0211d7def8ef30827e), [`3f1a0fa`](https://github.com/graphql-hive/gateway/commit/3f1a0fa9f1f3b91542d00a0211d7def8ef30827e)]:
  - @graphql-mesh/fusion-runtime@0.10.14
  - @graphql-tools/executor-http@1.1.13
  - @graphql-mesh/hmac-upstream-signature@1.2.14
  - @graphql-tools/federation@2.2.39

## 1.3.7

### Patch Changes

- [#269](https://github.com/graphql-hive/gateway/pull/269) [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@graphql-tools/utils@^10.6.2` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.6.2) (from `^10.6.0`, in `dependencies`)

- Updated dependencies [[`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`6f56083`](https://github.com/graphql-hive/gateway/commit/6f56083028402780f505db1492b9e84ab4227a4f), [`7df2215`](https://github.com/graphql-hive/gateway/commit/7df2215abd309dc1dfd91f4ec91ce975f3982c62), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`7df2215`](https://github.com/graphql-hive/gateway/commit/7df2215abd309dc1dfd91f4ec91ce975f3982c62), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4)]:
  - @graphql-mesh/fusion-runtime@0.10.13
  - @graphql-mesh/hmac-upstream-signature@1.2.14
  - @graphql-mesh/transport-common@0.7.21
  - @graphql-tools/batch-delegate@9.0.22
  - @graphql-tools/delegate@10.2.6
  - @graphql-tools/executor-http@1.1.12
  - @graphql-tools/federation@2.2.38
  - @graphql-tools/stitch@9.4.8
  - @graphql-tools/wrap@10.0.24

## 1.3.6

### Patch Changes

- Updated dependencies [[`9ce705c`](https://github.com/graphql-hive/gateway/commit/9ce705c5ccc5e6f4ac26af6e6471a6d2f4e995db)]:
  - @graphql-tools/delegate@10.2.5
  - @graphql-tools/batch-delegate@9.0.21
  - @graphql-tools/federation@2.2.37
  - @graphql-mesh/fusion-runtime@0.10.12
  - @graphql-tools/stitch@9.4.7
  - @graphql-mesh/transport-common@0.7.20
  - @graphql-tools/wrap@10.0.23
  - @graphql-mesh/hmac-upstream-signature@1.2.13

## 1.3.5

### Patch Changes

- Updated dependencies [[`76642d8`](https://github.com/graphql-hive/gateway/commit/76642d84b722bae28115310f25a6ac4865b41598), [`248c8a6`](https://github.com/graphql-hive/gateway/commit/248c8a65483b1dc7237f223ce1a707d6754192f6), [`76642d8`](https://github.com/graphql-hive/gateway/commit/76642d84b722bae28115310f25a6ac4865b41598), [`248c8a6`](https://github.com/graphql-hive/gateway/commit/248c8a65483b1dc7237f223ce1a707d6754192f6), [`248c8a6`](https://github.com/graphql-hive/gateway/commit/248c8a65483b1dc7237f223ce1a707d6754192f6)]:
  - @graphql-tools/stitch@9.4.6
  - @graphql-mesh/fusion-runtime@0.10.11
  - @graphql-tools/federation@2.2.36
  - @graphql-mesh/hmac-upstream-signature@1.2.12

## 1.3.4

### Patch Changes

- Updated dependencies []:
  - @graphql-tools/delegate@10.2.4
  - @graphql-tools/batch-delegate@9.0.20
  - @graphql-tools/federation@2.2.35
  - @graphql-mesh/fusion-runtime@0.10.10
  - @graphql-tools/stitch@9.4.5
  - @graphql-mesh/transport-common@0.7.19
  - @graphql-tools/wrap@10.0.22
  - @graphql-mesh/hmac-upstream-signature@1.2.12

## 1.3.3

### Patch Changes

- Updated dependencies [[`ba7e585`](https://github.com/graphql-hive/gateway/commit/ba7e585bcabbcec2ccd35f0903f25fdce9eeb214)]:
  - @graphql-mesh/fusion-runtime@0.10.9
  - @graphql-tools/federation@2.2.34
  - @graphql-mesh/hmac-upstream-signature@1.2.11

## 1.3.2

### Patch Changes

- Updated dependencies [[`7ca0ff3`](https://github.com/graphql-hive/gateway/commit/7ca0ff331e42c133c4218a8086bbf0a7607f45d0)]:
  - @graphql-tools/federation@2.2.33
  - @graphql-tools/delegate@10.2.3
  - @graphql-tools/stitch@9.4.4
  - @graphql-mesh/fusion-runtime@0.10.8
  - @graphql-tools/batch-delegate@9.0.19
  - @graphql-mesh/transport-common@0.7.18
  - @graphql-tools/wrap@10.0.21
  - @graphql-mesh/hmac-upstream-signature@1.2.11

## 1.3.1

### Patch Changes

- [#208](https://github.com/graphql-hive/gateway/pull/208) [`baf896d`](https://github.com/graphql-hive/gateway/commit/baf896d961bf122f7598355b0e9a09d93be1d822) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`graphql-yoga@^5.10.3` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.10.3) (from `^5.7.0`, in `dependencies`)

- [#216](https://github.com/graphql-hive/gateway/pull/216) [`d7d3e85`](https://github.com/graphql-hive/gateway/commit/d7d3e856d30f64922d540ad4228f589524001f93) Thanks [@ardatan](https://github.com/ardatan)! - Serve subgraph SDLs correctly via \`\_Service.sdl\`

- Updated dependencies [[`2e0add3`](https://github.com/graphql-hive/gateway/commit/2e0add3ea9b237ad385d5b5cd4c12eeeb847805a), [`baf896d`](https://github.com/graphql-hive/gateway/commit/baf896d961bf122f7598355b0e9a09d93be1d822), [`2e0add3`](https://github.com/graphql-hive/gateway/commit/2e0add3ea9b237ad385d5b5cd4c12eeeb847805a), [`2e0add3`](https://github.com/graphql-hive/gateway/commit/2e0add3ea9b237ad385d5b5cd4c12eeeb847805a), [`2e0add3`](https://github.com/graphql-hive/gateway/commit/2e0add3ea9b237ad385d5b5cd4c12eeeb847805a)]:
  - @graphql-mesh/fusion-runtime@0.10.7
  - @graphql-tools/executor-http@1.1.11
  - @graphql-tools/federation@2.2.32
  - @graphql-tools/delegate@10.2.2
  - @graphql-tools/stitch@9.4.3
  - @graphql-mesh/hmac-upstream-signature@1.2.10
  - @graphql-tools/batch-delegate@9.0.18
  - @graphql-mesh/transport-common@0.7.17
  - @graphql-tools/wrap@10.0.20

## 1.3.0

### Minor Changes

- [#207](https://github.com/graphql-hive/gateway/pull/207) [`5538e31`](https://github.com/graphql-hive/gateway/commit/5538e31a4242a31dbabef898d067f81cdaba5201) Thanks [@ardatan](https://github.com/ardatan)! - Support \`additionalTypeDefs\` in the gateway configuration

- [#203](https://github.com/graphql-hive/gateway/pull/203) [`2463109`](https://github.com/graphql-hive/gateway/commit/246310992a38e1d42eef0f6324f47b68e011eab4) Thanks [@ardatan](https://github.com/ardatan)! - Fix types for `disableIntrospection`

### Patch Changes

- [#164](https://github.com/graphql-hive/gateway/pull/164) [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@graphql-tools/utils@^10.6.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.6.0) (from `^10.5.6`, in `dependencies`)

- [#180](https://github.com/graphql-hive/gateway/pull/180) [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/store@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/store/v/0.103.4) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.4) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.4) (from `^0.103.1`, in `dependencies`)
  - Updated dependency [`@whatwg-node/server@^0.9.60` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.9.60) (from `^0.9.56`, in `dependencies`)

- [#185](https://github.com/graphql-hive/gateway/pull/185) [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/store@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/store/v/0.103.4) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.4) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.4) (from `^0.103.1`, in `dependencies`)

- [#206](https://github.com/graphql-hive/gateway/pull/206) [`a9daf33`](https://github.com/graphql-hive/gateway/commit/a9daf33e630c85b4162fbe252f6e8726c35bf314) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`@graphql-yoga/plugin-apollo-usage-report@^0.5.0` ↗︎](https://www.npmjs.com/package/@graphql-yoga/plugin-apollo-usage-report/v/0.5.0) (from `^0.4.0`, in `dependencies`)

- [#98](https://github.com/graphql-hive/gateway/pull/98) [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.8` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.8) (from `^0.4.7`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.1` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.1) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@whatwg-node/server@^0.9.56` ↗︎](https://www.npmjs.com/package/@whatwg-node/server/v/0.9.56) (from `^0.9.46`, in `dependencies`)

- [#180](https://github.com/graphql-hive/gateway/pull/180) [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5) Thanks [@ardatan](https://github.com/ardatan)! - Use new explicit resource management internally

- [#173](https://github.com/graphql-hive/gateway/pull/173) [`9d0d417`](https://github.com/graphql-hive/gateway/commit/9d0d417d8b5060c3867668e5b350b709b2a3327a) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Use provided cache to store fetched supergraph schema

- [#199](https://github.com/graphql-hive/gateway/pull/199) [`b534288`](https://github.com/graphql-hive/gateway/commit/b5342885f8ac1197d70cbf45266c83b720b4f85a) Thanks [@ardatan](https://github.com/ardatan)! - Logs are now easier to read, bigger results not do not create bigger outputs but instead they are all logged in a single line

- Updated dependencies [[`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`f71366d`](https://github.com/graphql-hive/gateway/commit/f71366d234fe8f30a419814fe1460f1e22663241), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`f71366d`](https://github.com/graphql-hive/gateway/commit/f71366d234fe8f30a419814fe1460f1e22663241), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`f71366d`](https://github.com/graphql-hive/gateway/commit/f71366d234fe8f30a419814fe1460f1e22663241), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`f71366d`](https://github.com/graphql-hive/gateway/commit/f71366d234fe8f30a419814fe1460f1e22663241), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`b534288`](https://github.com/graphql-hive/gateway/commit/b5342885f8ac1197d70cbf45266c83b720b4f85a), [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022)]:
  - @graphql-mesh/fusion-runtime@0.10.6
  - @graphql-mesh/hmac-upstream-signature@1.2.9
  - @graphql-mesh/transport-common@0.7.16
  - @graphql-tools/batch-delegate@9.0.17
  - @graphql-tools/delegate@10.2.1
  - @graphql-tools/executor-http@1.1.10
  - @graphql-tools/federation@2.2.31
  - @graphql-tools/stitch@9.4.2
  - @graphql-tools/wrap@10.0.19

## 1.2.1

### Patch Changes

- Updated dependencies [[`725d5b7`](https://github.com/graphql-hive/gateway/commit/725d5b7952be3a2fb2caeb40d26c194fb03b35d5)]:
  - @graphql-tools/federation@2.2.30
  - @graphql-tools/stitch@9.4.1
  - @graphql-mesh/fusion-runtime@0.10.5
  - @graphql-mesh/hmac-upstream-signature@1.2.8

## 1.2.0

### Minor Changes

- [#148](https://github.com/graphql-hive/gateway/pull/148) [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1) Thanks [@ardatan](https://github.com/ardatan)! - Introduce \`onDelegationPlan\` and \`onDelegationStageExecuteDone\` hooks

### Patch Changes

- [#148](https://github.com/graphql-hive/gateway/pull/148) [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.7) (from `^0.4.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-hive@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-hive/v/0.103.0) (from `^0.102.8`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-response-cache@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-response-cache/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/store@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/store/v/0.103.0) (from `^0.102.10`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/transport-common@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-mesh/transport-common/v/workspace:^) (from `^0.7.14`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.0) (from `^0.102.10`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.0) (from `^0.102.10`, in `dependencies`)

- [#150](https://github.com/graphql-hive/gateway/pull/150) [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.7) (from `^0.4.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-hive@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-hive/v/0.103.0) (from `^0.102.8`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-response-cache@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-response-cache/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/store@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/store/v/0.103.0) (from `^0.102.10`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/transport-common@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-mesh/transport-common/v/workspace:^) (from `^0.7.14`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.0) (from `^0.102.10`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.0) (from `^0.102.10`, in `dependencies`)

- [#148](https://github.com/graphql-hive/gateway/pull/148) [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1) Thanks [@ardatan](https://github.com/ardatan)! - Fetch and subgraph debuggers stringify lazily only when debug log level is enabled

- [#152](https://github.com/graphql-hive/gateway/pull/152) [`d491e7d`](https://github.com/graphql-hive/gateway/commit/d491e7d59920e94083d1b8322068bf34e6efb9d3) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Generate UUID using Math as RNG keeping platform independency

- [#143](https://github.com/graphql-hive/gateway/pull/143) [`3bf5c10`](https://github.com/graphql-hive/gateway/commit/3bf5c10808e6d08b985ac7fd4665a7641fa91afe) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Re-export LogLevel and DefaultLogger for easier access and logging manipulation

- Updated dependencies [[`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1)]:
  - @graphql-mesh/fusion-runtime@0.10.4
  - @graphql-mesh/hmac-upstream-signature@1.2.8
  - @graphql-mesh/transport-common@0.7.15
  - @graphql-tools/delegate@10.2.0
  - @graphql-tools/stitch@9.4.0
  - @graphql-tools/batch-delegate@9.0.16
  - @graphql-tools/federation@2.2.29
  - @graphql-tools/wrap@10.0.18

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
