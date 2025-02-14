# @graphql-hive/gateway-runtime

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
