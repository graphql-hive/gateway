# @graphql-hive/gateway

## 1.12.1

### Patch Changes

- [#838](https://github.com/graphql-hive/gateway/pull/838) [`b19309b`](https://github.com/graphql-hive/gateway/commit/b19309b450482c203b1c71fb5762320c7e5fa739) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Dispose of cache on teardown

- Updated dependencies [[`b19309b`](https://github.com/graphql-hive/gateway/commit/b19309b450482c203b1c71fb5762320c7e5fa739), [`b19309b`](https://github.com/graphql-hive/gateway/commit/b19309b450482c203b1c71fb5762320c7e5fa739), [`b19309b`](https://github.com/graphql-hive/gateway/commit/b19309b450482c203b1c71fb5762320c7e5fa739), [`115a1f1`](https://github.com/graphql-hive/gateway/commit/115a1f16791e5de39b14a41b375d061113844a1b)]:
  - @graphql-mesh/plugin-opentelemetry@1.3.47
  - @graphql-mesh/plugin-prometheus@1.3.35
  - @graphql-hive/gateway-runtime@1.6.1
  - @graphql-hive/plugin-aws-sigv4@1.0.1
  - @graphql-mesh/hmac-upstream-signature@1.2.22

## 1.12.0

### Minor Changes

- [#809](https://github.com/graphql-hive/gateway/pull/809) [`17cfa19`](https://github.com/graphql-hive/gateway/commit/17cfa190bf7965681716e5e1ec601793a85935d8) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Introduce `target` as a new Hive reporting option

  Deprecate the `--hive-registry-token` CLI option in favour of `--hive-usage-target` and `--hive-usage-access-token` options. [Read more on Hive's product update page.](https://the-guild.dev/graphql/hive/product-updates/2025-03-10-new-access-tokens)

### Patch Changes

- Updated dependencies [[`17cfa19`](https://github.com/graphql-hive/gateway/commit/17cfa190bf7965681716e5e1ec601793a85935d8), [`17cfa19`](https://github.com/graphql-hive/gateway/commit/17cfa190bf7965681716e5e1ec601793a85935d8)]:
  - @graphql-hive/gateway-runtime@1.6.0
  - @graphql-hive/plugin-aws-sigv4@1.0.0
  - @graphql-mesh/hmac-upstream-signature@1.2.22
  - @graphql-mesh/plugin-opentelemetry@1.3.46
  - @graphql-mesh/plugin-prometheus@1.3.34

## 1.11.0

### Minor Changes

- [#745](https://github.com/graphql-hive/gateway/pull/745) [`bbc98c5`](https://github.com/graphql-hive/gateway/commit/bbc98c58277283f064ba826a3d844709f75ac451) Thanks [@ardatan](https://github.com/ardatan)! - **_New plugin/feature:_**
  Demand Control a.k.a. Cost Limit including the implementation of `@cost` and `@listSize` directives

  [See the documentation to learn more](https://the-guild.dev/graphql/hive/docs/gateway/other-features/security/demand-control)

- [#746](https://github.com/graphql-hive/gateway/pull/746) [`09de0ba`](https://github.com/graphql-hive/gateway/commit/09de0bae281be40f8d8cc462d9c447d03141a5fa) Thanks [@ardatan](https://github.com/ardatan)! - Support for subgraph request authentication via [AWS Signature Version 4 (SigV4)](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html)

  Also it supports incoming request authentication via AWS Sigv4 by mimicing AWS APIs' behavior.

  [Learn more about this feature](https://graphql-hive.com/docs/gateway/other-features/security/aws-sigv4))

- [#795](https://github.com/graphql-hive/gateway/pull/795) [`ee00eaf`](https://github.com/graphql-hive/gateway/commit/ee00eaf8cd843dacba20b9235033b62f061195f7) Thanks [@ardatan](https://github.com/ardatan)! - Handle string value in `logging` like `logging: 'info'`

- [#667](https://github.com/graphql-hive/gateway/pull/667) [`3cdd0aa`](https://github.com/graphql-hive/gateway/commit/3cdd0aa8fa98a436365c2f36ca80d49968a48a5e) Thanks [@ardatan](https://github.com/ardatan)! - Expose internal methods `getCacheInstanceFromConfig` and `getBuiltinPluginsFromConfig`

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
  - Updated dependency [`graphql-yoga@^5.13.1` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.13.1) (from `^5.12.0`, in `dependencies`)

- [#667](https://github.com/graphql-hive/gateway/pull/667) [`3cdd0aa`](https://github.com/graphql-hive/gateway/commit/3cdd0aa8fa98a436365c2f36ca80d49968a48a5e) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-localforage@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-localforage/v/0.104.0) (from `^0.103.19`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-upstash-redis@^0.0.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-upstash-redis/v/0.0.6) (from `^0.0.5`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-mock@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-mock/v/0.104.0) (from `^0.103.19`, in `dependencies`)

- [#730](https://github.com/graphql-hive/gateway/pull/730) [`c47322a`](https://github.com/graphql-hive/gateway/commit/c47322a1a1385f24f7649f396fd2fbc632a9256c) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-upstash-redis@^0.0.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-upstash-redis/v/0.0.7) (from `^0.0.6`, in `dependencies`)

- [#732](https://github.com/graphql-hive/gateway/pull/732) [`c7a9849`](https://github.com/graphql-hive/gateway/commit/c7a98491e755cd234ba14033b39d5bc83ad0f945) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-upstash-redis@^0.0.8` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-upstash-redis/v/0.0.8) (from `^0.0.7`, in `dependencies`)

- [#746](https://github.com/graphql-hive/gateway/pull/746) [`09de0ba`](https://github.com/graphql-hive/gateway/commit/09de0bae281be40f8d8cc462d9c447d03141a5fa) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Added dependency [`@graphql-hive/plugin-aws-sigv4@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-hive/plugin-aws-sigv4/v/workspace:^) (to `dependencies`)

- [#775](https://github.com/graphql-hive/gateway/pull/775) [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-cfw-kv@^0.105.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-cfw-kv/v/0.105.0) (from `^0.104.18`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-localforage@^0.105.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-localforage/v/0.105.0) (from `^0.104.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-redis@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-redis/v/0.104.0) (from `^0.103.19`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-upstash-redis@^0.1.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-upstash-redis/v/0.1.0) (from `^0.0.8`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-deduplicate-request@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-deduplicate-request/v/0.104.0) (from `^0.103.18`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-http-cache@^0.105.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-http-cache/v/0.105.0) (from `^0.104.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-jit@^0.2.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jit/v/0.2.0) (from `^0.1.18`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-mock@^0.105.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-mock/v/0.105.0) (from `^0.104.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-rate-limit@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-rate-limit/v/0.104.0) (from `^0.103.19`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-snapshot@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-snapshot/v/0.104.0) (from `^0.103.18`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.104.0) (from `^0.103.18`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.104.0) (from `^0.103.18`, in `dependencies`)

- [#782](https://github.com/graphql-hive/gateway/pull/782) [`890f16a`](https://github.com/graphql-hive/gateway/commit/890f16afb352987f0565658f338022f9db3b4e3d) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/plugin-jwt-auth@^1.5.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jwt-auth/v/1.5.0) (from `^1.4.8`, in `dependencies`)

- [#806](https://github.com/graphql-hive/gateway/pull/806) [`b145a27`](https://github.com/graphql-hive/gateway/commit/b145a27fc8671f33c36f9f6a3a437d80107631ee) Thanks [@ardatan](https://github.com/ardatan)! - Fix `contentEncoding` type in `defineConfig`

- [#795](https://github.com/graphql-hive/gateway/pull/795) [`ee00eaf`](https://github.com/graphql-hive/gateway/commit/ee00eaf8cd843dacba20b9235033b62f061195f7) Thanks [@ardatan](https://github.com/ardatan)! - Use the same logging option handling logic, and export \`handleLoggingOption\` on runtime package

- Updated dependencies [[`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`c54a080`](https://github.com/graphql-hive/gateway/commit/c54a080b8b9c477ed55dd7c23fc8fcae9139bec8), [`f974f5b`](https://github.com/graphql-hive/gateway/commit/f974f5b22fb6a0f1a6d605eac69d94ad90357a9c), [`ff6dcaf`](https://github.com/graphql-hive/gateway/commit/ff6dcafbb226d66cc95f29e7287b4ca4eb4e9f8d), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`6cef6f0`](https://github.com/graphql-hive/gateway/commit/6cef6f0d6389b5521900d220a1d0ff1bee8158b6), [`817486d`](https://github.com/graphql-hive/gateway/commit/817486ddfb82590028e3775870c1fb5835766a24), [`890f16a`](https://github.com/graphql-hive/gateway/commit/890f16afb352987f0565658f338022f9db3b4e3d), [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`c54a080`](https://github.com/graphql-hive/gateway/commit/c54a080b8b9c477ed55dd7c23fc8fcae9139bec8), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`c54a080`](https://github.com/graphql-hive/gateway/commit/c54a080b8b9c477ed55dd7c23fc8fcae9139bec8), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`b145a27`](https://github.com/graphql-hive/gateway/commit/b145a27fc8671f33c36f9f6a3a437d80107631ee), [`9c2f323`](https://github.com/graphql-hive/gateway/commit/9c2f323ece47d9c0ef8f4e44050390096ceac17f), [`bbc98c5`](https://github.com/graphql-hive/gateway/commit/bbc98c58277283f064ba826a3d844709f75ac451), [`ee00eaf`](https://github.com/graphql-hive/gateway/commit/ee00eaf8cd843dacba20b9235033b62f061195f7), [`09de0ba`](https://github.com/graphql-hive/gateway/commit/09de0bae281be40f8d8cc462d9c447d03141a5fa), [`ee00eaf`](https://github.com/graphql-hive/gateway/commit/ee00eaf8cd843dacba20b9235033b62f061195f7), [`717b293`](https://github.com/graphql-hive/gateway/commit/717b29326b1b1a8d6b0ef399205b44eca123e648), [`e0d5feb`](https://github.com/graphql-hive/gateway/commit/e0d5feb156f896be5c5235eb1ae22144cf67eff9)]:
  - @graphql-hive/gateway-runtime@1.5.0
  - @graphql-hive/plugin-aws-sigv4@1.0.0
  - @graphql-mesh/hmac-upstream-signature@1.2.22
  - @graphql-mesh/plugin-opentelemetry@1.3.45
  - @graphql-mesh/plugin-prometheus@1.3.33
  - @graphql-mesh/transport-http@0.6.35
  - @graphql-mesh/transport-http-callback@0.5.22
  - @graphql-mesh/transport-ws@1.0.5

## 1.10.4

### Patch Changes

- [#696](https://github.com/graphql-hive/gateway/pull/696) [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@commander-js/extra-typings@^13.1.0` ↗︎](https://www.npmjs.com/package/@commander-js/extra-typings/v/13.1.0) (from `^13.0.0`, in `dependencies`)
  - Updated dependency [`@envelop/core@^5.1.0` ↗︎](https://www.npmjs.com/package/@envelop/core/v/5.1.0) (from `^5.0.2`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-cfw-kv@^0.104.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-cfw-kv/v/0.104.18) (from `^0.104.12`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-localforage@^0.103.19` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-localforage/v/0.103.19) (from `^0.103.13`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-redis@^0.103.19` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-redis/v/0.103.19) (from `^0.103.13`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-upstash-redis@^0.0.5` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-upstash-redis/v/0.0.5) (from `^0.0.4`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.10` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.10) (from `^0.4.9`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-deduplicate-request@^0.103.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-deduplicate-request/v/0.103.18) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-http-cache@^0.104.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-http-cache/v/0.104.6) (from `^0.104.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-jit@^0.1.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jit/v/0.1.18) (from `^0.1.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-jwt-auth@^1.4.8` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jwt-auth/v/1.4.8) (from `^1.3.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-mock@^0.103.19` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-mock/v/0.103.19) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-rate-limit@^0.103.19` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-rate-limit/v/0.103.19) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-snapshot@^0.103.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-snapshot/v/0.103.18) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.18) (from `^0.103.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.18) (from `^0.103.6`, in `dependencies`)
  - Updated dependency [`@graphql-tools/code-file-loader@^8.1.15` ↗︎](https://www.npmjs.com/package/@graphql-tools/code-file-loader/v/8.1.15) (from `^8.1.8`, in `dependencies`)
  - Updated dependency [`@graphql-tools/graphql-file-loader@^8.0.14` ↗︎](https://www.npmjs.com/package/@graphql-tools/graphql-file-loader/v/8.0.14) (from `^8.0.6`, in `dependencies`)
  - Updated dependency [`@graphql-tools/load@^8.0.14` ↗︎](https://www.npmjs.com/package/@graphql-tools/load/v/8.0.14) (from `^8.0.7`, in `dependencies`)
  - Updated dependency [`commander@^13.1.0` ↗︎](https://www.npmjs.com/package/commander/v/13.1.0) (from `^13.0.0`, in `dependencies`)
  - Updated dependency [`dotenv@^16.4.7` ↗︎](https://www.npmjs.com/package/dotenv/v/16.4.7) (from `^16.3.1`, in `dependencies`)
  - Updated dependency [`graphql-ws@^6.0.4` ↗︎](https://www.npmjs.com/package/graphql-ws/v/6.0.4) (from `^6.0.3`, in `dependencies`)
  - Updated dependency [`graphql-yoga@^5.12.0` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.12.0) (from `^5.10.11`, in `dependencies`)

- [#712](https://github.com/graphql-hive/gateway/pull/712) [`950fd7d`](https://github.com/graphql-hive/gateway/commit/950fd7ddf2e3c025fa369203212344764b03357a) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-localforage@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-localforage/v/0.104.0) (from `^0.103.19`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-upstash-redis@^0.0.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-upstash-redis/v/0.0.6) (from `^0.0.5`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-mock@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-mock/v/0.104.0) (from `^0.103.19`, in `dependencies`)

- Updated dependencies [[`0ff5c55`](https://github.com/graphql-hive/gateway/commit/0ff5c55501ac766057cd3290dd5ec73093438764), [`40f5d1d`](https://github.com/graphql-hive/gateway/commit/40f5d1d1765de020e0486a392a2223d8d83a9962), [`2e3ce14`](https://github.com/graphql-hive/gateway/commit/2e3ce1423049553d5cb1d14645295c5f04b96c85), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`2e3ce14`](https://github.com/graphql-hive/gateway/commit/2e3ce1423049553d5cb1d14645295c5f04b96c85), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a289faa`](https://github.com/graphql-hive/gateway/commit/a289faae1469eb46f1458be341d21909fe5f8f8f), [`a9395eb`](https://github.com/graphql-hive/gateway/commit/a9395eb29b25c795701642176243b3aac629dbef)]:
  - @graphql-hive/gateway-runtime@1.4.17
  - @graphql-mesh/hmac-upstream-signature@1.2.21
  - @graphql-mesh/plugin-opentelemetry@1.3.44
  - @graphql-mesh/plugin-prometheus@1.3.32
  - @graphql-mesh/transport-http@0.6.34
  - @graphql-mesh/transport-http-callback@0.5.21
  - @graphql-mesh/transport-ws@1.0.4

## 1.10.3

### Patch Changes

- [#664](https://github.com/graphql-hive/gateway/pull/664) [`b4d4760`](https://github.com/graphql-hive/gateway/commit/b4d4760861f360bed0e1566a50833164678fe3d5) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-upstash-redis@^0.0.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-upstash-redis/v/0.0.4) (from `^0.0.3`, in `dependencies`)

## 1.10.2

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.4.15
  - @graphql-mesh/hmac-upstream-signature@1.2.20
  - @graphql-mesh/plugin-opentelemetry@1.3.43
  - @graphql-mesh/plugin-prometheus@1.3.31

## 1.10.1

### Patch Changes

- Updated dependencies [[`36b1baf`](https://github.com/graphql-hive/gateway/commit/36b1bafdcded06dc3d7a2166b7a39988d07af817)]:
  - @graphql-hive/gateway-runtime@1.4.14
  - @graphql-mesh/hmac-upstream-signature@1.2.20
  - @graphql-mesh/plugin-opentelemetry@1.3.42
  - @graphql-mesh/plugin-prometheus@1.3.30

## 1.10.0

### Minor Changes

- [#634](https://github.com/graphql-hive/gateway/pull/634) [`2292a33`](https://github.com/graphql-hive/gateway/commit/2292a335181b06bbf1004d9d6ec422d1453afcdc) Thanks [@ardatan](https://github.com/ardatan)! - Redis Sentinel Support

  See the relevant doc section; [Providing Cache Storage](https://the-guild.dev/graphql/hive/docs/gateway/other-features/performance#providing-cache-storage)

- [#634](https://github.com/graphql-hive/gateway/pull/634) [`2292a33`](https://github.com/graphql-hive/gateway/commit/2292a335181b06bbf1004d9d6ec422d1453afcdc) Thanks [@ardatan](https://github.com/ardatan)! - New Upstash Redis Cache support;

  See the relevant doc section; [Providing Cache Storage](https://the-guild.dev/graphql/hive/docs/gateway/other-features/performance#providing-cache-storage)

### Patch Changes

- [#620](https://github.com/graphql-hive/gateway/pull/620) [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-tools/utils@^10.8.1` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.8.1) (from `^10.7.0`, in `dependencies`)

- [#634](https://github.com/graphql-hive/gateway/pull/634) [`2292a33`](https://github.com/graphql-hive/gateway/commit/2292a335181b06bbf1004d9d6ec422d1453afcdc) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Added dependency [`@graphql-mesh/cache-upstash-redis@^0.0.1` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-upstash-redis/v/0.0.1) (to `dependencies`)

- [#638](https://github.com/graphql-hive/gateway/pull/638) [`e618b1c`](https://github.com/graphql-hive/gateway/commit/e618b1c476fbe5d538c6f3f4e49393ab4cb9b849) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-upstash-redis@^0.0.2` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-upstash-redis/v/0.0.2) (from `^0.0.1`, in `dependencies`)

- [#643](https://github.com/graphql-hive/gateway/pull/643) [`e279884`](https://github.com/graphql-hive/gateway/commit/e279884fda28318a74fb2ffec2053ea74ca6e422) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-upstash-redis@^0.0.3` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-upstash-redis/v/0.0.3) (from `^0.0.2`, in `dependencies`)

- [#642](https://github.com/graphql-hive/gateway/pull/642) [`30e41a6`](https://github.com/graphql-hive/gateway/commit/30e41a6f5b97c42ae548564bce3f6e4a92b1225f) Thanks [@ardatan](https://github.com/ardatan)! - New JSON-based logger

  By default, it prints pretty still to the console unless NODE_ENV is production.
  For JSON output, set the `LOG_FORMAT` environment variable to `json`.

- Updated dependencies [[`260faaf`](https://github.com/graphql-hive/gateway/commit/260faafa26598066ee95ee501858998483d46e1f), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`4c82bb1`](https://github.com/graphql-hive/gateway/commit/4c82bb176c230d46fd69747c1b83a0d0a400eddb), [`30e41a6`](https://github.com/graphql-hive/gateway/commit/30e41a6f5b97c42ae548564bce3f6e4a92b1225f), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`30e41a6`](https://github.com/graphql-hive/gateway/commit/30e41a6f5b97c42ae548564bce3f6e4a92b1225f)]:
  - @graphql-hive/gateway-runtime@1.4.13
  - @graphql-mesh/hmac-upstream-signature@1.2.20
  - @graphql-mesh/plugin-opentelemetry@1.3.41
  - @graphql-mesh/plugin-prometheus@1.3.29
  - @graphql-mesh/transport-http@0.6.33
  - @graphql-mesh/transport-http-callback@0.5.20
  - @graphql-mesh/transport-ws@1.0.3
  - @graphql-hive/importer@1.0.1

## 1.9.4

### Patch Changes

- Updated dependencies [[`8c80ac9`](https://github.com/graphql-hive/gateway/commit/8c80ac98cd5afd7c063945f4704fe4866622c5d7), [`8c80ac9`](https://github.com/graphql-hive/gateway/commit/8c80ac98cd5afd7c063945f4704fe4866622c5d7)]:
  - @graphql-hive/gateway-runtime@1.4.12
  - @graphql-mesh/transport-http-callback@0.5.19
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-mesh/plugin-opentelemetry@1.3.40
  - @graphql-mesh/plugin-prometheus@1.3.28
  - @graphql-mesh/transport-http@0.6.32
  - @graphql-mesh/transport-ws@1.0.2

## 1.9.3

### Patch Changes

- Updated dependencies [[`7d42160`](https://github.com/graphql-hive/gateway/commit/7d42160c31a10efbc680826704410fc1a33fb97c), [`7d42160`](https://github.com/graphql-hive/gateway/commit/7d42160c31a10efbc680826704410fc1a33fb97c)]:
  - @graphql-mesh/transport-ws@1.0.1

## 1.9.2

### Patch Changes

- [#481](https://github.com/graphql-hive/gateway/pull/481) [`0b13cb4`](https://github.com/graphql-hive/gateway/commit/0b13cb472305edd01cdbd964a71995831797305e) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:

  - Updated dependency [`graphql-ws@^6.0.3` ↗︎](https://www.npmjs.com/package/graphql-ws/v/6.0.3) (from `^5.16.0`, in `dependencies`)

- [#481](https://github.com/graphql-hive/gateway/pull/481) [`0b13cb4`](https://github.com/graphql-hive/gateway/commit/0b13cb472305edd01cdbd964a71995831797305e) Thanks [@enisdenjo](https://github.com/enisdenjo)! - WebSocket transport options allow configuring only `connectionParams`

  In most of the cases you won't need to configure the underlying graphql-ws client any further.

- [#481](https://github.com/graphql-hive/gateway/pull/481) [`0b13cb4`](https://github.com/graphql-hive/gateway/commit/0b13cb472305edd01cdbd964a71995831797305e) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Upgrade graphql-ws to v6

  If you have a custom graphql-ws configuration when using the transport, you will have to migrate the graphql-ws side to v6. [Please consult the changelog of graphql-ws.](https://github.com/enisdenjo/graphql-ws/releases/tag/v6.0.0)

- Updated dependencies [[`0b13cb4`](https://github.com/graphql-hive/gateway/commit/0b13cb472305edd01cdbd964a71995831797305e), [`0b13cb4`](https://github.com/graphql-hive/gateway/commit/0b13cb472305edd01cdbd964a71995831797305e), [`0b13cb4`](https://github.com/graphql-hive/gateway/commit/0b13cb472305edd01cdbd964a71995831797305e), [`0b13cb4`](https://github.com/graphql-hive/gateway/commit/0b13cb472305edd01cdbd964a71995831797305e), [`0b13cb4`](https://github.com/graphql-hive/gateway/commit/0b13cb472305edd01cdbd964a71995831797305e)]:
  - @graphql-hive/gateway-runtime@1.4.11
  - @graphql-mesh/transport-ws@1.0.0
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-mesh/plugin-opentelemetry@1.3.39
  - @graphql-mesh/plugin-prometheus@1.3.27

## 1.9.1

### Patch Changes

- [#574](https://github.com/graphql-hive/gateway/pull/574) [`8c466f4`](https://github.com/graphql-hive/gateway/commit/8c466f49cd54fe4a341b398bbda9f06955ad9807) Thanks [@ardatan](https://github.com/ardatan)! - Fix the regression causing `port`, `host` and `pollingInterval` in the configuration is overriden by the default values of CLI parameters

## 1.9.0

### Minor Changes

- [#568](https://github.com/graphql-hive/gateway/pull/568) [`de83dd2`](https://github.com/graphql-hive/gateway/commit/de83dd28c01b1c07471a735f7c2b94dd3f45ab0a) Thanks [@dotansimha](https://github.com/dotansimha)! - Improve `cache` configuration signature.

  The `cache` configuration key now allow you to pass a custom factory function to get the cache instance:

  ```ts
  import { defineConfig } from '@graphql-hive/gateway';

  export const gatewayConfig = defineConfig({
    // ...
    cache: (ctx) => {
      // Here you may create/retrieve your cache store instance, and return a KeyValueCache instance
    },
  });
  ```

### Patch Changes

- [#561](https://github.com/graphql-hive/gateway/pull/561) [`7f6490f`](https://github.com/graphql-hive/gateway/commit/7f6490f695d6e7b8e180c4b049cdaeb8b5242e8c) Thanks [@ardatan](https://github.com/ardatan)! - Binary for Linux-ARM64

- [#568](https://github.com/graphql-hive/gateway/pull/568) [`de83dd2`](https://github.com/graphql-hive/gateway/commit/de83dd28c01b1c07471a735f7c2b94dd3f45ab0a) Thanks [@dotansimha](https://github.com/dotansimha)! - Use the same logging instance across different components whenever possible

  For example if the log level is set in the configuration, change it immediately for the cache storages etc.

## 1.8.1

### Patch Changes

- [#526](https://github.com/graphql-hive/gateway/pull/526) [`188a763`](https://github.com/graphql-hive/gateway/commit/188a763901be6aeaf33447316bbdd101b0467a46) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/plugin-http-cache@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-http-cache/v/0.104.0) (from `^0.103.0`, in `dependencies`)

- [#538](https://github.com/graphql-hive/gateway/pull/538) [`aab5441`](https://github.com/graphql-hive/gateway/commit/aab544176983e241c62f15242a35ca1398efa044) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`graphql-yoga@^5.10.11` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.10.11) (from `^5.10.6`, in `dependencies`)

- [#539](https://github.com/graphql-hive/gateway/pull/539) [`df20361`](https://github.com/graphql-hive/gateway/commit/df203610ff9ed50adb3c3c82631ecb5324648486) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`parse-duration@^2.0.0` ↗︎](https://www.npmjs.com/package/parse-duration/v/2.0.0) (from `^1.1.0`, in `dependencies`)

- [#555](https://github.com/graphql-hive/gateway/pull/555) [`836ab2c`](https://github.com/graphql-hive/gateway/commit/836ab2c8c7579c51b00bdc3d15dcdaee05aaf26a) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:

  - Removed dependency [`parse-duration@^2.0.0` ↗︎](https://www.npmjs.com/package/parse-duration/v/2.0.0) (from `dependencies`)

- [#549](https://github.com/graphql-hive/gateway/pull/549) [`46888f1`](https://github.com/graphql-hive/gateway/commit/46888f1202cfb300b540b78199250b0b426c069d) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Export `getGraphQLWSOptions` function that creates `graphql-ws` for the Hive Gateway

  Allowing the users to correctly set up WebSockets when using the Hive Gateway programmatically.

- [#555](https://github.com/graphql-hive/gateway/pull/555) [`836ab2c`](https://github.com/graphql-hive/gateway/commit/836ab2c8c7579c51b00bdc3d15dcdaee05aaf26a) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Bundle `parse-duration` dependency

  [`parse-duration` is ESM only starting from v2](https://github.com/jkroso/parse-duration/releases/tag/v2.0.0). We therefore bundle it in because doing so we transpile it to CJS and allow importing the GW in CJS.

- Updated dependencies [[`aab5441`](https://github.com/graphql-hive/gateway/commit/aab544176983e241c62f15242a35ca1398efa044), [`46888f1`](https://github.com/graphql-hive/gateway/commit/46888f1202cfb300b540b78199250b0b426c069d), [`180c2c4`](https://github.com/graphql-hive/gateway/commit/180c2c43218027600d3ad6ce74b413ad7621d427), [`aab5441`](https://github.com/graphql-hive/gateway/commit/aab544176983e241c62f15242a35ca1398efa044), [`46888f1`](https://github.com/graphql-hive/gateway/commit/46888f1202cfb300b540b78199250b0b426c069d), [`61f387c`](https://github.com/graphql-hive/gateway/commit/61f387c8a1e18a5d7a37cd33afb428488ac13aed)]:
  - @graphql-hive/gateway-runtime@1.4.10
  - @graphql-mesh/plugin-prometheus@1.3.26
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-mesh/plugin-opentelemetry@1.3.38

## 1.8.0

### Minor Changes

- [#462](https://github.com/graphql-hive/gateway/pull/462) [`9a6ae85`](https://github.com/graphql-hive/gateway/commit/9a6ae85470de66fa397c8f0f03e66f6919eddfdb) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Point to exact location of syntax error when parsing malformed config files

### Patch Changes

- [#462](https://github.com/graphql-hive/gateway/pull/462) [`9a6ae85`](https://github.com/graphql-hive/gateway/commit/9a6ae85470de66fa397c8f0f03e66f6919eddfdb) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:

  - Added dependency [`@graphql-hive/importer@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-hive/importer/v/workspace:^) (to `dependencies`)
  - Removed dependency [`@graphql-mesh/include@^0.2.3` ↗︎](https://www.npmjs.com/package/@graphql-mesh/include/v/0.2.3) (from `dependencies`)

- [#462](https://github.com/graphql-hive/gateway/pull/462) [`9a6ae85`](https://github.com/graphql-hive/gateway/commit/9a6ae85470de66fa397c8f0f03e66f6919eddfdb) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Use `@graphql-hive/importer` for importing configs and transpiling TypeScript files

- Updated dependencies [[`9a6ae85`](https://github.com/graphql-hive/gateway/commit/9a6ae85470de66fa397c8f0f03e66f6919eddfdb)]:
  - @graphql-hive/importer@1.0.0
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-hive/gateway-runtime@1.4.9
  - @graphql-mesh/plugin-opentelemetry@1.3.37
  - @graphql-mesh/plugin-prometheus@1.3.25

## 1.7.9

### Patch Changes

- Updated dependencies [[`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92), [`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92), [`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92)]:
  - @graphql-hive/gateway-runtime@1.4.8
  - @graphql-mesh/transport-http-callback@0.5.18
  - @graphql-mesh/transport-http@0.6.31
  - @graphql-mesh/plugin-opentelemetry@1.3.36
  - @graphql-mesh/plugin-prometheus@1.3.24
  - @graphql-mesh/transport-ws@0.4.16
  - @graphql-mesh/hmac-upstream-signature@1.2.19

## 1.7.8

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.4.7
  - @graphql-mesh/plugin-opentelemetry@1.3.35
  - @graphql-mesh/plugin-prometheus@1.3.23
  - @graphql-mesh/hmac-upstream-signature@1.2.19

## 1.7.7

### Patch Changes

- [#412](https://github.com/graphql-hive/gateway/pull/412) [`0d7b42d`](https://github.com/graphql-hive/gateway/commit/0d7b42d8631962be78ab5b8c4655b812b9f71817) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Dont install peer dependencies automatically with npm in Docker

- Updated dependencies []:
  - @graphql-mesh/hmac-upstream-signature@1.2.19

## 1.7.6

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.4.6
  - @graphql-mesh/transport-http@0.6.30
  - @graphql-mesh/plugin-opentelemetry@1.3.34
  - @graphql-mesh/plugin-prometheus@1.3.22
  - @graphql-mesh/transport-http-callback@0.5.17
  - @graphql-mesh/transport-ws@0.4.15
  - @graphql-mesh/hmac-upstream-signature@1.2.19

## 1.7.5

### Patch Changes

- [#390](https://github.com/graphql-hive/gateway/pull/390) [`708c32f`](https://github.com/graphql-hive/gateway/commit/708c32f30bd0950e0e397a50c64af3ed9bd40d5c) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`commander@^13.0.0` ↗︎](https://www.npmjs.com/package/commander/v/13.0.0) (from `^12.0.0`, in `dependencies`)

- [#392](https://github.com/graphql-hive/gateway/pull/392) [`121751d`](https://github.com/graphql-hive/gateway/commit/121751db50bc13454122f4decbba715ba8d400c2) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@commander-js/extra-typings@^13.0.0` ↗︎](https://www.npmjs.com/package/@commander-js/extra-typings/v/13.0.0) (from `^12.1.0`, in `dependencies`)
  - Updated dependency [`commander@^13.0.0` ↗︎](https://www.npmjs.com/package/commander/v/13.0.0) (from `^12.0.0`, in `dependencies`)

- Updated dependencies []:
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-hive/gateway-runtime@1.4.5
  - @graphql-mesh/plugin-opentelemetry@1.3.33
  - @graphql-mesh/plugin-prometheus@1.3.21

## 1.7.4

### Patch Changes

- Updated dependencies [[`55eb1b4`](https://github.com/graphql-hive/gateway/commit/55eb1b4d14aec7b3e6c7bcf9f596bc01192d022c), [`55eb1b4`](https://github.com/graphql-hive/gateway/commit/55eb1b4d14aec7b3e6c7bcf9f596bc01192d022c), [`55eb1b4`](https://github.com/graphql-hive/gateway/commit/55eb1b4d14aec7b3e6c7bcf9f596bc01192d022c)]:
  - @graphql-mesh/hmac-upstream-signature@1.2.19
  - @graphql-mesh/transport-http-callback@0.5.16
  - @graphql-mesh/transport-http@0.6.29
  - @graphql-mesh/transport-ws@0.4.14
  - @graphql-hive/gateway-runtime@1.4.4
  - @graphql-mesh/plugin-opentelemetry@1.3.32
  - @graphql-mesh/plugin-prometheus@1.3.20

## 1.7.3

### Patch Changes

- [#373](https://github.com/graphql-hive/gateway/pull/373) [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-tools/utils@^10.7.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.7.0) (from `^10.6.2`, in `dependencies`)

- Updated dependencies [[`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`15975c2`](https://github.com/graphql-hive/gateway/commit/15975c28daddbb4f31d520371f53520aecacaac7), [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2)]:
  - @graphql-hive/gateway-runtime@1.4.3
  - @graphql-mesh/hmac-upstream-signature@1.2.18
  - @graphql-mesh/plugin-opentelemetry@1.3.31
  - @graphql-mesh/plugin-prometheus@1.3.19
  - @graphql-mesh/transport-http@0.6.28
  - @graphql-mesh/transport-http-callback@0.5.15
  - @graphql-mesh/transport-ws@0.4.13

## 1.7.2

### Patch Changes

- [#357](https://github.com/graphql-hive/gateway/pull/357) [`8b64103`](https://github.com/graphql-hive/gateway/commit/8b64103324d82c4934ff459ea644276bafbcda17) Thanks [@ardatan](https://github.com/ardatan)! - Fix the bug on setting the default polling interval to 10 seconds
  So by default, the gateway will poll the schema every 10 seconds, and update the schema if it has changed.

  This PR also contains improvements on logging about polling

- [#342](https://github.com/graphql-hive/gateway/pull/342) [`2f59fce`](https://github.com/graphql-hive/gateway/commit/2f59fce8aece4a326b20d4a9db2ee53773675e70) Thanks [@ardatan](https://github.com/ardatan)! - Respect both registry token from CLI arguments and the configuration in the \`gateway.config\`

  User can provide the token in the CLI arguments, and have some registry configuration in \`gateway.config\`

- Updated dependencies [[`7a1877a`](https://github.com/graphql-hive/gateway/commit/7a1877a66de082d5a0e4a17d1a715c10773abd77), [`8b64103`](https://github.com/graphql-hive/gateway/commit/8b64103324d82c4934ff459ea644276bafbcda17), [`122c013`](https://github.com/graphql-hive/gateway/commit/122c0133bea6137b1760b4af064de9aeba53bcc5), [`2f59fce`](https://github.com/graphql-hive/gateway/commit/2f59fce8aece4a326b20d4a9db2ee53773675e70)]:
  - @graphql-mesh/plugin-opentelemetry@1.3.30
  - @graphql-hive/gateway-runtime@1.4.2
  - @graphql-mesh/hmac-upstream-signature@1.2.17
  - @graphql-mesh/plugin-prometheus@1.3.18

## 1.7.1

### Patch Changes

- [#333](https://github.com/graphql-hive/gateway/pull/333) [`0d81307`](https://github.com/graphql-hive/gateway/commit/0d813079753e7c66158499e2db6e301a3c145856) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`graphql-yoga@^5.10.6` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.10.6) (from `^5.10.4`, in `dependencies`)

- Updated dependencies [[`0d81307`](https://github.com/graphql-hive/gateway/commit/0d813079753e7c66158499e2db6e301a3c145856), [`0d81307`](https://github.com/graphql-hive/gateway/commit/0d813079753e7c66158499e2db6e301a3c145856)]:
  - @graphql-hive/gateway-runtime@1.4.1
  - @graphql-mesh/plugin-prometheus@1.3.17
  - @graphql-mesh/hmac-upstream-signature@1.2.17
  - @graphql-mesh/plugin-opentelemetry@1.3.29

## 1.7.0

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

- Updated dependencies [[`23b8987`](https://github.com/graphql-hive/gateway/commit/23b89874fcf10b4cb6b1b941f29fa5f5aecf0ef2), [`23b8987`](https://github.com/graphql-hive/gateway/commit/23b89874fcf10b4cb6b1b941f29fa5f5aecf0ef2)]:
  - @graphql-hive/gateway-runtime@1.4.0
  - @graphql-mesh/plugin-opentelemetry@1.3.28
  - @graphql-mesh/plugin-prometheus@1.3.16
  - @graphql-mesh/hmac-upstream-signature@1.2.17
  - @graphql-mesh/transport-http@0.6.27
  - @graphql-mesh/transport-http-callback@0.5.14
  - @graphql-mesh/transport-ws@0.4.12

## 1.6.8

### Patch Changes

- Updated dependencies [[`367b359`](https://github.com/graphql-hive/gateway/commit/367b3593cb7fd51c42ef4a13ab4adac202845734)]:
  - @graphql-mesh/transport-http@0.6.26
  - @graphql-hive/gateway-runtime@1.3.15
  - @graphql-mesh/plugin-opentelemetry@1.3.27
  - @graphql-mesh/plugin-prometheus@1.3.15
  - @graphql-mesh/hmac-upstream-signature@1.2.16

## 1.6.7

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.3.14
  - @graphql-mesh/plugin-opentelemetry@1.3.26
  - @graphql-mesh/plugin-prometheus@1.3.14
  - @graphql-mesh/hmac-upstream-signature@1.2.16

## 1.6.6

### Patch Changes

- Updated dependencies [[`21ac43e`](https://github.com/graphql-hive/gateway/commit/21ac43eaa46a704a8ffc91398d01240fb2f4b33a)]:
  - @graphql-hive/gateway-runtime@1.3.13
  - @graphql-mesh/plugin-opentelemetry@1.3.25
  - @graphql-mesh/plugin-prometheus@1.3.13
  - @graphql-mesh/hmac-upstream-signature@1.2.16

## 1.6.5

### Patch Changes

- [#291](https://github.com/graphql-hive/gateway/pull/291) [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.9` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.9) (from `^0.4.8`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.6) (from `^0.103.4`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.6) (from `^0.103.4`, in `dependencies`)
  - Updated dependency [`graphql-yoga@^5.10.4` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.10.4) (from `^5.10.3`, in `dependencies`)
  - Updated dependency [`tslib@^2.8.1` ↗︎](https://www.npmjs.com/package/tslib/v/2.8.1) (from `^2.8.0`, in `dependencies`)

- Updated dependencies [[`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151), [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151)]:
  - @graphql-hive/gateway-runtime@1.3.12
  - @graphql-mesh/hmac-upstream-signature@1.2.16
  - @graphql-mesh/plugin-opentelemetry@1.3.24
  - @graphql-mesh/plugin-prometheus@1.3.12
  - @graphql-mesh/transport-http@0.6.25
  - @graphql-mesh/transport-http-callback@0.5.13
  - @graphql-mesh/transport-ws@0.4.11

## 1.6.4

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.3.11
  - @graphql-mesh/plugin-opentelemetry@1.3.23
  - @graphql-mesh/plugin-prometheus@1.3.11
  - @graphql-mesh/hmac-upstream-signature@1.2.15

## 1.6.3

### Patch Changes

- [#286](https://github.com/graphql-hive/gateway/pull/286) [`ed9e205`](https://github.com/graphql-hive/gateway/commit/ed9e205adf705f31b6ae85ce4ad7a8eb0b30fe32) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Removed dependency [`@graphql-mesh/store@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/store/v/0.103.4) (from `dependencies`)

- Updated dependencies [[`ed9e205`](https://github.com/graphql-hive/gateway/commit/ed9e205adf705f31b6ae85ce4ad7a8eb0b30fe32), [`ed9e205`](https://github.com/graphql-hive/gateway/commit/ed9e205adf705f31b6ae85ce4ad7a8eb0b30fe32), [`ed9e205`](https://github.com/graphql-hive/gateway/commit/ed9e205adf705f31b6ae85ce4ad7a8eb0b30fe32), [`ed9e205`](https://github.com/graphql-hive/gateway/commit/ed9e205adf705f31b6ae85ce4ad7a8eb0b30fe32)]:
  - @graphql-hive/gateway-runtime@1.3.10
  - @graphql-mesh/hmac-upstream-signature@1.2.15
  - @graphql-mesh/plugin-opentelemetry@1.3.22
  - @graphql-mesh/plugin-prometheus@1.3.10

## 1.6.2

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.3.9
  - @graphql-mesh/plugin-opentelemetry@1.3.21
  - @graphql-mesh/plugin-prometheus@1.3.9
  - @graphql-mesh/hmac-upstream-signature@1.2.14

## 1.6.1

### Patch Changes

- [#276](https://github.com/graphql-hive/gateway/pull/276) [`7e444f9`](https://github.com/graphql-hive/gateway/commit/7e444f9669b0169799630a3f3dfd10f89896d3a0) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Added dependency [`@graphql-tools/code-file-loader@^8.1.8` ↗︎](https://www.npmjs.com/package/@graphql-tools/code-file-loader/v/8.1.8) (to `dependencies`)
  - Added dependency [`@graphql-tools/graphql-file-loader@^8.0.6` ↗︎](https://www.npmjs.com/package/@graphql-tools/graphql-file-loader/v/8.0.6) (to `dependencies`)
  - Added dependency [`@graphql-tools/load@^8.0.7` ↗︎](https://www.npmjs.com/package/@graphql-tools/load/v/8.0.7) (to `dependencies`)

- [#276](https://github.com/graphql-hive/gateway/pull/276) [`7e444f9`](https://github.com/graphql-hive/gateway/commit/7e444f9669b0169799630a3f3dfd10f89896d3a0) Thanks [@ardatan](https://github.com/ardatan)! - Support loading files based on paths and globs

- Updated dependencies [[`c77884b`](https://github.com/graphql-hive/gateway/commit/c77884bec188bb8bff9fe83d2ce8ff3ff61aa3f7)]:
  - @graphql-mesh/plugin-opentelemetry@1.3.20
  - @graphql-mesh/hmac-upstream-signature@1.2.14
  - @graphql-hive/gateway-runtime@1.3.8
  - @graphql-mesh/transport-http@0.6.24
  - @graphql-mesh/plugin-prometheus@1.3.8

## 1.6.0

### Minor Changes

- [#254](https://github.com/graphql-hive/gateway/pull/254) [`18c86e7`](https://github.com/graphql-hive/gateway/commit/18c86e797bbd1f741ca5d629108a93441ef1210d) Thanks [@ardatan](https://github.com/ardatan)! - Configure request timeout with `requestTimeout` option.

### Patch Changes

- [#269](https://github.com/graphql-hive/gateway/pull/269) [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-tools/utils@^10.6.2` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.6.2) (from `^10.6.0`, in `dependencies`)

- Updated dependencies [[`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4), [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4)]:
  - @graphql-hive/gateway-runtime@1.3.7
  - @graphql-mesh/hmac-upstream-signature@1.2.14
  - @graphql-mesh/plugin-opentelemetry@1.3.19
  - @graphql-mesh/plugin-prometheus@1.3.7
  - @graphql-mesh/transport-http@0.6.23
  - @graphql-mesh/transport-http-callback@0.5.12
  - @graphql-mesh/transport-ws@0.4.10

## 1.5.9

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.3.6
  - @graphql-mesh/plugin-opentelemetry@1.3.18
  - @graphql-mesh/plugin-prometheus@1.3.6
  - @graphql-mesh/hmac-upstream-signature@1.2.13
  - @graphql-mesh/transport-http@0.6.22
  - @graphql-mesh/transport-http-callback@0.5.11
  - @graphql-mesh/transport-ws@0.4.9

## 1.5.8

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.3.5
  - @graphql-mesh/plugin-opentelemetry@1.3.17
  - @graphql-mesh/plugin-prometheus@1.3.5
  - @graphql-mesh/hmac-upstream-signature@1.2.12

## 1.5.7

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.3.4
  - @graphql-mesh/plugin-opentelemetry@1.3.16
  - @graphql-mesh/plugin-prometheus@1.3.4
  - @graphql-mesh/hmac-upstream-signature@1.2.12
  - @graphql-mesh/transport-http@0.6.21
  - @graphql-mesh/transport-http-callback@0.5.10
  - @graphql-mesh/transport-ws@0.4.8

## 1.5.6

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.3.3
  - @graphql-mesh/plugin-opentelemetry@1.3.15
  - @graphql-mesh/plugin-prometheus@1.3.3
  - @graphql-mesh/hmac-upstream-signature@1.2.11

## 1.5.5

### Patch Changes

- Updated dependencies []:
  - @graphql-hive/gateway-runtime@1.3.2
  - @graphql-mesh/plugin-opentelemetry@1.3.14
  - @graphql-mesh/plugin-prometheus@1.3.2
  - @graphql-mesh/hmac-upstream-signature@1.2.11
  - @graphql-mesh/transport-http@0.6.20
  - @graphql-mesh/transport-http-callback@0.5.9
  - @graphql-mesh/transport-ws@0.4.7

## 1.5.4

### Patch Changes

- [#205](https://github.com/graphql-hive/gateway/pull/205) [`2e0add3`](https://github.com/graphql-hive/gateway/commit/2e0add3ea9b237ad385d5b5cd4c12eeeb847805a) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`graphql-yoga@^5.10.3` ↗︎](https://www.npmjs.com/package/graphql-yoga/v/5.10.3) (from `^5.7.0`, in `dependencies`)

- Updated dependencies [[`baf896d`](https://github.com/graphql-hive/gateway/commit/baf896d961bf122f7598355b0e9a09d93be1d822), [`2e0add3`](https://github.com/graphql-hive/gateway/commit/2e0add3ea9b237ad385d5b5cd4c12eeeb847805a), [`2e0add3`](https://github.com/graphql-hive/gateway/commit/2e0add3ea9b237ad385d5b5cd4c12eeeb847805a), [`d7d3e85`](https://github.com/graphql-hive/gateway/commit/d7d3e856d30f64922d540ad4228f589524001f93)]:
  - @graphql-hive/gateway-runtime@1.3.1
  - @graphql-mesh/plugin-prometheus@1.3.1
  - @graphql-mesh/transport-http-callback@0.5.8
  - @graphql-mesh/hmac-upstream-signature@1.2.10
  - @graphql-mesh/plugin-opentelemetry@1.3.13
  - @graphql-mesh/transport-http@0.6.19
  - @graphql-mesh/transport-ws@0.4.6

## 1.5.3

### Patch Changes

- [#164](https://github.com/graphql-hive/gateway/pull/164) [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-tools/utils@^10.6.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.6.0) (from `^10.5.6`, in `dependencies`)

- [#180](https://github.com/graphql-hive/gateway/pull/180) [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/store@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/store/v/0.103.4) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.4) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.4) (from `^0.103.1`, in `dependencies`)

- [#185](https://github.com/graphql-hive/gateway/pull/185) [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/store@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/store/v/0.103.4) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.4) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.4) (from `^0.103.1`, in `dependencies`)

- [#98](https://github.com/graphql-hive/gateway/pull/98) [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.8` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.8) (from `^0.4.7`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.1` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.1) (from `^0.103.0`, in `dependencies`)

- [#180](https://github.com/graphql-hive/gateway/pull/180) [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5) Thanks [@ardatan](https://github.com/ardatan)! - Use new explicit resource management internally

- [#173](https://github.com/graphql-hive/gateway/pull/173) [`9d0d417`](https://github.com/graphql-hive/gateway/commit/9d0d417d8b5060c3867668e5b350b709b2a3327a) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Use provided cache to store fetched supergraph schema

- [#98](https://github.com/graphql-hive/gateway/pull/98) [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022) Thanks [@ardatan](https://github.com/ardatan)! - Bun support by using native Bun API whenever possible

- Updated dependencies [[`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`a9daf33`](https://github.com/graphql-hive/gateway/commit/a9daf33e630c85b4162fbe252f6e8726c35bf314), [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`92d977e`](https://github.com/graphql-hive/gateway/commit/92d977eaa784b1e78f091f6f155dd347052cc6b3), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022), [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b), [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`9d0d417`](https://github.com/graphql-hive/gateway/commit/9d0d417d8b5060c3867668e5b350b709b2a3327a), [`b534288`](https://github.com/graphql-hive/gateway/commit/b5342885f8ac1197d70cbf45266c83b720b4f85a), [`5538e31`](https://github.com/graphql-hive/gateway/commit/5538e31a4242a31dbabef898d067f81cdaba5201), [`92d977e`](https://github.com/graphql-hive/gateway/commit/92d977eaa784b1e78f091f6f155dd347052cc6b3), [`3a2d26e`](https://github.com/graphql-hive/gateway/commit/3a2d26e86de1b77827e7167ba4fb1d87d6a7f960), [`2463109`](https://github.com/graphql-hive/gateway/commit/246310992a38e1d42eef0f6324f47b68e011eab4)]:
  - @graphql-hive/gateway-runtime@1.3.0
  - @graphql-mesh/hmac-upstream-signature@1.2.9
  - @graphql-mesh/plugin-opentelemetry@1.3.12
  - @graphql-mesh/plugin-prometheus@1.3.0
  - @graphql-mesh/transport-http@0.6.18
  - @graphql-mesh/transport-http-callback@0.5.7
  - @graphql-mesh/transport-ws@0.4.5

## 1.5.2

### Patch Changes

- Updated dependencies [[`4e1d246`](https://github.com/graphql-hive/gateway/commit/4e1d246b3650e653bfe0c415ae1f21967543b27d), [`094ca85`](https://github.com/graphql-hive/gateway/commit/094ca858182aa9253b03655c64d24f3e897c02e8), [`094ca85`](https://github.com/graphql-hive/gateway/commit/094ca858182aa9253b03655c64d24f3e897c02e8)]:
  - @graphql-mesh/plugin-opentelemetry@1.3.11
  - @graphql-mesh/plugin-prometheus@1.2.10
  - @graphql-hive/gateway-runtime@1.2.1
  - @graphql-mesh/hmac-upstream-signature@1.2.8

## 1.5.1

### Patch Changes

- [#140](https://github.com/graphql-hive/gateway/pull/140) [`ce37b62`](https://github.com/graphql-hive/gateway/commit/ce37b629f7d462f3e24bad8aca2ec092827c8b45) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-cfw-kv@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-cfw-kv/v/0.103.0) (from `^0.102.6`, in `dependencies`)

- [#148](https://github.com/graphql-hive/gateway/pull/148) [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-cfw-kv@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-cfw-kv/v/0.104.0) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-localforage@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-localforage/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-redis@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-redis/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.7) (from `^0.4.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/include@^0.2.3` ↗︎](https://www.npmjs.com/package/@graphql-mesh/include/v/0.2.3) (from `^0.2.2`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-deduplicate-request@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-deduplicate-request/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-http-cache@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-http-cache/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-jit@^0.1.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jit/v/0.1.0) (from `^0.0.7`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-jwt-auth@^1.3.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jwt-auth/v/1.3.0) (from `^1.1.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-mock@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-mock/v/0.103.0) (from `^0.102.7`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-rate-limit@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-rate-limit/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-snapshot@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-snapshot/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/store@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/store/v/0.103.0) (from `^0.102.10`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.0) (from `^0.102.10`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.0) (from `^0.102.10`, in `dependencies`)

- [#150](https://github.com/graphql-hive/gateway/pull/150) [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cache-cfw-kv@^0.104.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-cfw-kv/v/0.104.0) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-localforage@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-localforage/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cache-redis@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cache-redis/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.7) (from `^0.4.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/include@^0.2.3` ↗︎](https://www.npmjs.com/package/@graphql-mesh/include/v/0.2.3) (from `^0.2.2`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-deduplicate-request@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-deduplicate-request/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-http-cache@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-http-cache/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-jit@^0.1.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jit/v/0.1.0) (from `^0.0.7`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-jwt-auth@^1.3.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jwt-auth/v/1.3.0) (from `^1.1.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-mock@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-mock/v/0.103.0) (from `^0.102.7`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-rate-limit@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-rate-limit/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-snapshot@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-snapshot/v/0.103.0) (from `^0.102.6`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/store@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/store/v/0.103.0) (from `^0.102.10`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.0) (from `^0.102.10`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.0) (from `^0.102.10`, in `dependencies`)

- [#143](https://github.com/graphql-hive/gateway/pull/143) [`3bf5c10`](https://github.com/graphql-hive/gateway/commit/3bf5c10808e6d08b985ac7fd4665a7641fa91afe) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Re-export LogLevel and DefaultLogger for easier access and logging manipulation

- [#150](https://github.com/graphql-hive/gateway/pull/150) [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Added graphql-middleware as a dependency to @graphql-mesh/plugin-rate-limit plugin

- Updated dependencies [[`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`d491e7d`](https://github.com/graphql-hive/gateway/commit/d491e7d59920e94083d1b8322068bf34e6efb9d3), [`3bf5c10`](https://github.com/graphql-hive/gateway/commit/3bf5c10808e6d08b985ac7fd4665a7641fa91afe)]:
  - @graphql-hive/gateway-runtime@1.2.0
  - @graphql-mesh/hmac-upstream-signature@1.2.8
  - @graphql-mesh/plugin-opentelemetry@1.3.10
  - @graphql-mesh/plugin-prometheus@1.2.9
  - @graphql-mesh/transport-http@0.6.17
  - @graphql-mesh/transport-http-callback@0.5.6
  - @graphql-mesh/transport-ws@0.4.4

## 1.5.0

### Minor Changes

- [#87](https://github.com/graphql-hive/gateway/pull/87) [`e3e6a18`](https://github.com/graphql-hive/gateway/commit/e3e6a18a28352d96e4062f62e76b9ab36f7c88bb) Thanks [@klippx](https://github.com/klippx)! - Export `useRateLimit` and `usePrometheus`

### Patch Changes

- [#108](https://github.com/graphql-hive/gateway/pull/108) [`86c7ac1`](https://github.com/graphql-hive/gateway/commit/86c7ac1df787e9d38bdb001483b0588ada962c5c) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/hmac-upstream-signature@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-mesh/hmac-upstream-signature/v/workspace:^) (from `^1.1.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-opentelemetry@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-opentelemetry/v/workspace:^) (from `^1.1.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/plugin-prometheus@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-prometheus/v/workspace:^) (from `^1.1.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/transport-http@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-mesh/transport-http/v/workspace:^) (from `^0.6.15`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/transport-http-callback@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-mesh/transport-http-callback/v/workspace:^) (from `^0.5.2`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/transport-ws@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-mesh/transport-ws/v/workspace:^) (from `^0.4.0`, in `dependencies`)

- [#118](https://github.com/graphql-hive/gateway/pull/118) [`73c621d`](https://github.com/graphql-hive/gateway/commit/73c621d98a4e6ca134527e349bc71223c03d06db) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/plugin-jit@^0.0.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jit/v/0.0.7) (from `^0.0.6`, in `dependencies`)

- [#122](https://github.com/graphql-hive/gateway/pull/122) [`bb5a756`](https://github.com/graphql-hive/gateway/commit/bb5a756588b66537bb5679d2a657f28242ee16e6) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/plugin-jit@^0.0.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jit/v/0.0.7) (from `^0.0.6`, in `dependencies`)

- [#91](https://github.com/graphql-hive/gateway/pull/91) [`8b7e2a3`](https://github.com/graphql-hive/gateway/commit/8b7e2a373b475ac5c3d02e682f42e20d441636a4) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/plugin-jit@^0.0.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jit/v/0.0.6) (from `^0.0.5`, in `dependencies`)

- [`c95d25e`](https://github.com/graphql-hive/gateway/commit/c95d25e3a2dbe20795f88965cdcd22a49f51f1c1) Thanks [@enisdenjo](https://github.com/enisdenjo)! - `onError` and `onEnd` callbacks from `onSubgraphExecute` are invoked only once regardless of how many times throw/return was called on the iterator

- [`93bd019`](https://github.com/graphql-hive/gateway/commit/93bd019a3abe10a45c82c49dd0626e12bef7d33f) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Bump @graphql-mesh/transport-http. Latest includes a fix for canceling SSE streams even while waiting for next event

- [`e73b2be`](https://github.com/graphql-hive/gateway/commit/e73b2bece94772fb14f33777c71524ac6a292bc4) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Use ranged dependencies from the monorepo

- Updated dependencies [[`bca7230`](https://github.com/graphql-hive/gateway/commit/bca72302580289dd6c4fec1da988465ff894e745), [`86c7ac1`](https://github.com/graphql-hive/gateway/commit/86c7ac1df787e9d38bdb001483b0588ada962c5c), [`73c621d`](https://github.com/graphql-hive/gateway/commit/73c621d98a4e6ca134527e349bc71223c03d06db), [`4288177`](https://github.com/graphql-hive/gateway/commit/4288177ed6e6df7bb741891754d67f8ec0aea9cf), [`65b7444`](https://github.com/graphql-hive/gateway/commit/65b74449c2a01b9c229d10f5da25814397083865), [`445809e`](https://github.com/graphql-hive/gateway/commit/445809ec4f621b9f61593e92f599b6369e13f414), [`73c621d`](https://github.com/graphql-hive/gateway/commit/73c621d98a4e6ca134527e349bc71223c03d06db), [`73c621d`](https://github.com/graphql-hive/gateway/commit/73c621d98a4e6ca134527e349bc71223c03d06db), [`387e346`](https://github.com/graphql-hive/gateway/commit/387e346dbd8c27ecbdb3a6dec6fb64863432b38c), [`c95d25e`](https://github.com/graphql-hive/gateway/commit/c95d25e3a2dbe20795f88965cdcd22a49f51f1c1), [`19bc6a4`](https://github.com/graphql-hive/gateway/commit/19bc6a4c222ff157553785ea16760888cdfe10bb), [`e73b2be`](https://github.com/graphql-hive/gateway/commit/e73b2bece94772fb14f33777c71524ac6a292bc4)]:
  - @graphql-hive/gateway-runtime@1.1.7
  - @graphql-mesh/plugin-opentelemetry@1.3.9
  - @graphql-mesh/transport-http@0.6.16
  - @graphql-mesh/transport-ws@0.4.3
  - @graphql-mesh/hmac-upstream-signature@1.2.7
  - @graphql-mesh/transport-http-callback@0.5.5
  - @graphql-mesh/plugin-prometheus@1.2.8

## 1.4.12

### Patch Changes

- [`eebfc84`](https://github.com/graphql-hive/gateway/commit/eebfc84567720f771296ead420bfbc1015c8e0c3) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Inject helpers containing code that detects at runtime if the required value contains the `__esModule` property.

- Updated dependencies [[`eebfc84`](https://github.com/graphql-hive/gateway/commit/eebfc84567720f771296ead420bfbc1015c8e0c3)]:
  - @graphql-hive/gateway-runtime@1.1.6

## 1.4.11

### Patch Changes

- Updated dependencies [[`7c9560a`](https://github.com/graphql-hive/gateway/commit/7c9560aa77bf40c37074eb5b77f9941664062b5e)]:
  - @graphql-hive/gateway-runtime@1.1.5

## 1.4.10

### Patch Changes

- Updated dependencies [[`9a0b434`](https://github.com/graphql-hive/gateway/commit/9a0b4346a9344add8e933c7d1a2706e759cb56de)]:
  - @graphql-hive/gateway-runtime@1.1.4

## 1.4.9

### Patch Changes

- [#71](https://github.com/graphql-hive/gateway/pull/71) [`ccee7f2`](https://github.com/graphql-hive/gateway/commit/ccee7f2bc36a5990bb9b944b6c6bad47305bcb17) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Added dependency [`@graphql-mesh/transport-http@^0.6.7` ↗︎](https://www.npmjs.com/package/@graphql-mesh/transport-http/v/0.6.7) (to `dependencies`)

- Updated dependencies [[`ccee7f2`](https://github.com/graphql-hive/gateway/commit/ccee7f2bc36a5990bb9b944b6c6bad47305bcb17)]:
  - @graphql-hive/gateway-runtime@1.1.3

## 1.4.8

### Patch Changes

- [`106f6c1`](https://github.com/graphql-hive/gateway/commit/106f6c128b4a1d188645eba850ff6935d26ef74a) Thanks [@ardatan](https://github.com/ardatan)! - Support `mesh.config` configuration file name for backwards compatibility

## 1.4.7

### Patch Changes

- Updated dependencies [[`6ad4b1a`](https://github.com/graphql-hive/gateway/commit/6ad4b1aa998e8753779e01737c4bea733580819f)]:
  - @graphql-hive/gateway-runtime@1.1.2

## 1.4.6

### Patch Changes

- [`33eb2e5`](https://github.com/graphql-hive/gateway/commit/33eb2e5963b7e0edaa7fae1fde412222d6e5e364) Thanks [@ardatan](https://github.com/ardatan)! - Respect available memory on forking the processes not just CPU

## 1.4.5

### Patch Changes

- [`4aa45c3`](https://github.com/graphql-hive/gateway/commit/4aa45c356a703055bf16934755fd1c13aea9eccf) Thanks [@ardatan](https://github.com/ardatan)! - Pass configuration from the CLI parameters to the plugins

## 1.4.4

### Patch Changes

- Updated dependencies [[`07fe045`](https://github.com/graphql-hive/gateway/commit/07fe0458935ff0f171db8c9fa96bdbdd02884716)]:
  - @graphql-hive/gateway-runtime@1.1.1

## 1.4.3

### Patch Changes

- Updated dependencies [[`7f5e0b0`](https://github.com/graphql-hive/gateway/commit/7f5e0b07a3e3bdd6d84bc9527fa1f83db5fe0c45), [`106eace`](https://github.com/graphql-hive/gateway/commit/106eacee488670155a11e539655d8c4c22d54ffe)]:
  - @graphql-hive/gateway-runtime@1.1.0

## 1.4.2

### Patch Changes

- [#41](https://github.com/graphql-hive/gateway/pull/41) [`2f9b289`](https://github.com/graphql-hive/gateway/commit/2f9b2899ab9a05ab79ca47399809f4bfbb9092ec) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/plugin-jit@^0.0.5` ↗︎](https://www.npmjs.com/package/@graphql-mesh/plugin-jit/v/0.0.5) (from `^0.0.4`, in `dependencies`)

## 1.4.1

### Patch Changes

- [`a0434c6`](https://github.com/graphql-hive/gateway/commit/a0434c6c0dd37d0fe42f5187eeae79e1076280c5) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Hive Gateway has been moved to a new GitHub repository! You can now find it at [github.com/graphql-hive/gateway](https://github.com/graphql-hive/gateway).

- Updated dependencies [[`53a8d59`](https://github.com/graphql-hive/gateway/commit/53a8d590941d84345c4a49a854404eef3a0c04d9)]:
  - @graphql-hive/gateway-runtime@1.0.0
