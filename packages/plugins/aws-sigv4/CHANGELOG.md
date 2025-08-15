# @graphql-hive/plugin-aws-sigv4

## 1.0.18

### Patch Changes

- [#1370](https://github.com/graphql-hive/gateway/pull/1370) [`bed67a6`](https://github.com/graphql-hive/gateway/commit/bed67a6eaf57b2aa6c7d08d1137b3bd8c4d4b066) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@aws-sdk/client-sts@^3.858.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.858.0) (from `^3.857.0`, in `dependencies`)

- Updated dependencies [[`a832e7b`](https://github.com/graphql-hive/gateway/commit/a832e7bf9a8f92c48fb9df8ca1bff5a008dcf420)]:
  - @graphql-mesh/fusion-runtime@0.11.20

## 1.0.17

### Patch Changes

- [#1367](https://github.com/graphql-hive/gateway/pull/1367) [`bfe2ac7`](https://github.com/graphql-hive/gateway/commit/bfe2ac7fbb40b3a1fc22c8be9d52b95c68ee4fe3) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@aws-sdk/client-sts@^3.857.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.857.0) (from `^3.848.0`, in `dependencies`)

- [#1368](https://github.com/graphql-hive/gateway/pull/1368) [`a6aeed2`](https://github.com/graphql-hive/gateway/commit/a6aeed298de71271e59f86d3effc14ae0f65c703) Thanks [@ardatan](https://github.com/ardatan)! - Support `Promise` as a result of `outgoing`;

  So you can use credentials providers from `@aws-sdk/credential-providers` package.
  [See more](https://www.npmjs.com/package/@aws-sdk/credential-providers#fromnodeproviderchain).

  ```ts
  import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
  import { defineConfig } from '@graphql-hive/gateway';

  const config = defineConfig({
    plugins: [
      useAWSSigv4({
        outgoing: fromNodeProviderChain({
          // This provider accepts any input of fromEnv(), fromSSO(), fromTokenFile(),
          // fromIni(), fromProcess(), fromInstanceMetadata(), fromContainerMetadata()
          // that exist in the default credential chain.

          // Optional client overrides. This is passed to an inner credentials client
          // that may be STS, SSO, or other instantiated to resolve the credentials.
          // Region and profile are inherited from the upper client if present
          // unless overridden, so it should not be necessary to set those.
          //
          // Warning: setting a region here may override the region set in
          // the config file for the selected profile if profile-based
          // credentials are used.
          clientConfig: {},
        }),
      }),
    ],
  });
  ```

- Updated dependencies [[`8e37851`](https://github.com/graphql-hive/gateway/commit/8e3785194d97edbe82c7fce316104b81bb0362f1)]:
  - @graphql-mesh/fusion-runtime@0.11.19

## 1.0.16

### Patch Changes

- [#1321](https://github.com/graphql-hive/gateway/pull/1321) [`6215001`](https://github.com/graphql-hive/gateway/commit/6215001b1d650ad865331661532bcc4f7bad6b40) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@aws-sdk/client-sts@^3.844.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.844.0) (from `^3.828.0`, in `dependencies`)

- [#1344](https://github.com/graphql-hive/gateway/pull/1344) [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@aws-sdk/client-sts@^3.848.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.848.0) (from `^3.844.0`, in `dependencies`)

- [#1333](https://github.com/graphql-hive/gateway/pull/1333) [`ffa3753`](https://github.com/graphql-hive/gateway/commit/ffa3753ccb9045c5b2d62af05edc7f1d78336cb3) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Isomorphic environment variable getter with truthy value parsing

- Updated dependencies [[`7dafdeb`](https://github.com/graphql-hive/gateway/commit/7dafdebc803e49373fe9d53997113483e512fdb0), [`6215001`](https://github.com/graphql-hive/gateway/commit/6215001b1d650ad865331661532bcc4f7bad6b40), [`a71236d`](https://github.com/graphql-hive/gateway/commit/a71236d6ba356741bc85fe27757bea45576dcf1a)]:
  - @graphql-mesh/fusion-runtime@0.11.18

## 1.0.15

### Patch Changes

- Updated dependencies []:
  - @graphql-mesh/fusion-runtime@0.11.17

## 1.0.14

### Patch Changes

- Updated dependencies []:
  - @graphql-mesh/fusion-runtime@0.11.16

## 1.0.13

### Patch Changes

- [#1217](https://github.com/graphql-hive/gateway/pull/1217) [`931d576`](https://github.com/graphql-hive/gateway/commit/931d5763c1f8c6d7fdc299bd87a634fecdd70b15) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@aws-sdk/client-sts@^3.825.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.825.0) (from `^3.823.0`, in `dependencies`)

- [#1225](https://github.com/graphql-hive/gateway/pull/1225) [`3dc8ab2`](https://github.com/graphql-hive/gateway/commit/3dc8ab25d40b6a6191c1b4185e97882caef4e8d6) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@aws-sdk/client-sts@^3.826.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.826.0) (from `^3.825.0`, in `dependencies`)

- [#1233](https://github.com/graphql-hive/gateway/pull/1233) [`ed323fa`](https://github.com/graphql-hive/gateway/commit/ed323fa06d196c1df128a493006238078bf69fc6) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@aws-sdk/client-sts@^3.828.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.828.0) (from `^3.826.0`, in `dependencies`)

- Updated dependencies [[`29f537f`](https://github.com/graphql-hive/gateway/commit/29f537f7dfcf17f3911efd5845d7af1e532d2e85), [`3d24beb`](https://github.com/graphql-hive/gateway/commit/3d24beb7b15fd8109f86bbb3dfd514f6b8202741)]:
  - @graphql-mesh/fusion-runtime@0.11.15

## 1.0.12

### Patch Changes

- [#1195](https://github.com/graphql-hive/gateway/pull/1195) [`cdc959c`](https://github.com/graphql-hive/gateway/commit/cdc959c57dd770fd5f0bcd05a5de7e3102dacfe2) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@aws-sdk/client-sts@^3.821.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.821.0) (from `^3.817.0`, in `dependencies`)

- [#1203](https://github.com/graphql-hive/gateway/pull/1203) [`4bab6a3`](https://github.com/graphql-hive/gateway/commit/4bab6a3048cd6a9b20b221d625ed94a1e2cf8689) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@aws-sdk/client-sts@^3.823.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.823.0) (from `^3.821.0`, in `dependencies`)

## 1.0.11

### Patch Changes

- [#1156](https://github.com/graphql-hive/gateway/pull/1156) [`fb74009`](https://github.com/graphql-hive/gateway/commit/fb740098652dba2e9107981d1f4e362143478451) Thanks [@dependabot](https://github.com/apps/dependabot)! - dependencies updates:
  - Updated dependency [`@aws-sdk/client-sts@^3.817.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.817.0) (from `^3.758.0`, in `dependencies`)

- Updated dependencies [[`fb74009`](https://github.com/graphql-hive/gateway/commit/fb740098652dba2e9107981d1f4e362143478451)]:
  - @graphql-mesh/fusion-runtime@0.11.14

## 1.0.10

### Patch Changes

- Updated dependencies [[`88c9369`](https://github.com/graphql-hive/gateway/commit/88c9369abfdcb8e5ed8331c12a42a90e3b6b211b)]:
  - @graphql-mesh/fusion-runtime@0.11.13

## 1.0.9

### Patch Changes

- Updated dependencies [[`2dc5fd8`](https://github.com/graphql-hive/gateway/commit/2dc5fd89a292811e7ea845d14e0ddacecfa83e9f)]:
  - @graphql-mesh/fusion-runtime@0.11.12

## 1.0.8

### Patch Changes

- Updated dependencies [[`e6dfbcd`](https://github.com/graphql-hive/gateway/commit/e6dfbcd4d1d2ebbdb7c5454b691b1be2b9c466b3)]:
  - @graphql-mesh/fusion-runtime@0.11.11

## 1.0.7

### Patch Changes

- [#1045](https://github.com/graphql-hive/gateway/pull/1045) [`da47a0e`](https://github.com/graphql-hive/gateway/commit/da47a0effcc0e3c2b934bc97ab10e6e86ef8cd93) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Update graphql-yoga and whatwg-node packages

  In light of https://github.com/ardatan/whatwg-node/pull/2305. Please upgrade as soon as possible!

- Updated dependencies [[`9a120c8`](https://github.com/graphql-hive/gateway/commit/9a120c85ac67654f63e374cf420ac4b73da21228), [`da47a0e`](https://github.com/graphql-hive/gateway/commit/da47a0effcc0e3c2b934bc97ab10e6e86ef8cd93), [`da47a0e`](https://github.com/graphql-hive/gateway/commit/da47a0effcc0e3c2b934bc97ab10e6e86ef8cd93)]:
  - @graphql-mesh/fusion-runtime@0.11.10

## 1.0.6

### Patch Changes

- Updated dependencies [[`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35), [`c7ea2c5`](https://github.com/graphql-hive/gateway/commit/c7ea2c5ae71b6b338ef22edd927a3fc93803965f), [`7d771d8`](https://github.com/graphql-hive/gateway/commit/7d771d89ff6d731b1025acfc5eb197541a6d5d35)]:
  - @graphql-mesh/fusion-runtime@0.11.9

## 1.0.5

### Patch Changes

- Updated dependencies []:
  - @graphql-mesh/fusion-runtime@0.11.8

## 1.0.4

### Patch Changes

- Updated dependencies [[`ab96392`](https://github.com/graphql-hive/gateway/commit/ab96392b3561de62cf6a57280e4c3ac0ec98d88b)]:
  - @graphql-mesh/fusion-runtime@0.11.7

## 1.0.3

### Patch Changes

- [#532](https://github.com/graphql-hive/gateway/pull/532) [`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04) Thanks [@EmrysMyrddin](https://github.com/EmrysMyrddin)! - dependencies updates:
  - Updated dependency [`@whatwg-node/promise-helpers@^1.3.0` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.3.0) (from `^1.2.5`, in `dependencies`)

- Updated dependencies [[`4e33933`](https://github.com/graphql-hive/gateway/commit/4e339333945f4c4547d9ae719e67b4671fe89f04), [`3003ae2`](https://github.com/graphql-hive/gateway/commit/3003ae2545148f75edf0ddca5e84c7b527176713)]:
  - @graphql-mesh/fusion-runtime@0.11.6

## 1.0.2

### Patch Changes

- [#862](https://github.com/graphql-hive/gateway/pull/862) [`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency [`@whatwg-node/promise-helpers@^1.2.5` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.2.5) (from `^1.2.4`, in `dependencies`)

- Updated dependencies [[`278618a`](https://github.com/graphql-hive/gateway/commit/278618a1383a01016041ce0a40adec8803c62448)]:
  - @graphql-mesh/fusion-runtime@0.11.5

## 1.0.1

### Patch Changes

- Updated dependencies [[`115a1f1`](https://github.com/graphql-hive/gateway/commit/115a1f16791e5de39b14a41b375d061113844a1b)]:
  - @graphql-mesh/fusion-runtime@0.11.4

## 1.0.0

### Major Changes

- [#746](https://github.com/graphql-hive/gateway/pull/746) [`09de0ba`](https://github.com/graphql-hive/gateway/commit/09de0bae281be40f8d8cc462d9c447d03141a5fa) Thanks [@ardatan](https://github.com/ardatan)! - Support for subgraph request authentication via [AWS Signature Version 4 (SigV4)](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html)

  Also it supports incoming request authentication via AWS Sigv4 by mimicing AWS APIs' behavior.

  [Learn more about this feature](https://graphql-hive.com/docs/gateway/other-features/security/aws-sigv4))

### Patch Changes

- [#759](https://github.com/graphql-hive/gateway/pull/759) [`817486d`](https://github.com/graphql-hive/gateway/commit/817486ddfb82590028e3775870c1fb5835766a24) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Added dependency [`@aws-sdk/client-sts@^3.758.0` ↗︎](https://www.npmjs.com/package/@aws-sdk/client-sts/v/3.758.0) (to `dependencies`)

- [#782](https://github.com/graphql-hive/gateway/pull/782) [`890f16a`](https://github.com/graphql-hive/gateway/commit/890f16afb352987f0565658f338022f9db3b4e3d) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Added dependency [`@whatwg-node/promise-helpers@^1.2.4` ↗︎](https://www.npmjs.com/package/@whatwg-node/promise-helpers/v/1.2.4) (to `dependencies`)

- Updated dependencies [[`e393337`](https://github.com/graphql-hive/gateway/commit/e393337ecb40beffb79748b19b5aa8f2fd9197b7), [`6334b2e`](https://github.com/graphql-hive/gateway/commit/6334b2e5d4942693121ab7d44a96fa80408aace1), [`c54a080`](https://github.com/graphql-hive/gateway/commit/c54a080b8b9c477ed55dd7c23fc8fcae9139bec8), [`002fc95`](https://github.com/graphql-hive/gateway/commit/002fc95c446470943de4d0ef1457850277c3d8aa), [`33f7dfd`](https://github.com/graphql-hive/gateway/commit/33f7dfdb10eef2a1e7f6dffe0ce6e4bb3cc7c2c6), [`0451e82`](https://github.com/graphql-hive/gateway/commit/0451e82446a83a17f9fd4b285da240fb00f1c162)]:
  - @graphql-mesh/fusion-runtime@0.11.3
