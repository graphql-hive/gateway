# @graphql-hive/plugin-aws-sigv4

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
