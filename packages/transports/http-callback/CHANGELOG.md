# @graphql-mesh/transport-http-callback

## 0.5.20

### Patch Changes

- [#620](https://github.com/graphql-hive/gateway/pull/620) [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-tools/utils@^10.8.1` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.8.1) (from `^10.7.0`, in `dependencies`)

- [#642](https://github.com/graphql-hive/gateway/pull/642) [`30e41a6`](https://github.com/graphql-hive/gateway/commit/30e41a6f5b97c42ae548564bce3f6e4a92b1225f) Thanks [@ardatan](https://github.com/ardatan)! - New JSON-based logger

  By default, it prints pretty still to the console unless NODE_ENV is production.
  For JSON output, set the `LOG_FORMAT` environment variable to `json`.

- Updated dependencies [[`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9), [`d72209a`](https://github.com/graphql-hive/gateway/commit/d72209ad82ec53689f93ce5d81bfa52493919ad9)]:
  - @graphql-mesh/transport-common@0.7.29
  - @graphql-tools/executor-common@0.0.2

## 0.5.19

### Patch Changes

- [#598](https://github.com/graphql-hive/gateway/pull/598) [`8c80ac9`](https://github.com/graphql-hive/gateway/commit/8c80ac98cd5afd7c063945f4704fe4866622c5d7) Thanks [@ardatan](https://github.com/ardatan)! - Use native AbortSignal, AbortController APIs instead of custom ones

- Updated dependencies [[`8c80ac9`](https://github.com/graphql-hive/gateway/commit/8c80ac98cd5afd7c063945f4704fe4866622c5d7)]:
  - @graphql-mesh/transport-common@0.7.28

## 0.5.18

### Patch Changes

- [#420](https://github.com/graphql-hive/gateway/pull/420) [`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92) Thanks [@ardatan](https://github.com/ardatan)! - - In case of schema reload, throw `SCHEMA_RELOAD` error while recreating the transports and executors

  - In case of shut down, throw `SHUTTING_DOWN` error while cleaning the transports and executors up

  Previously, these errors are only thrown for subscriptions not it is thrown in other type of operations as well.
  And previously the thrown errors during these two cleanup and restart process were cryptic, now the mentioned two errors above are thrown with more clear messages

- Updated dependencies [[`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92), [`14152f7`](https://github.com/graphql-hive/gateway/commit/14152f70d91572c0e60ba15ddeb2ffd0b41c9e92)]:
  - @graphql-mesh/transport-common@0.7.27

## 0.5.17

### Patch Changes

- Updated dependencies []:
  - @graphql-mesh/transport-common@0.7.26

## 0.5.16

### Patch Changes

- [#381](https://github.com/graphql-hive/gateway/pull/381) [`55eb1b4`](https://github.com/graphql-hive/gateway/commit/55eb1b4d14aec7b3e6c7bcf9f596bc01192d022c) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Added dependency [`@graphql-tools/executor-common@workspace:^` ↗︎](https://www.npmjs.com/package/@graphql-tools/executor-common/v/workspace:^) (to `dependencies`)

- Updated dependencies [[`55eb1b4`](https://github.com/graphql-hive/gateway/commit/55eb1b4d14aec7b3e6c7bcf9f596bc01192d022c), [`55eb1b4`](https://github.com/graphql-hive/gateway/commit/55eb1b4d14aec7b3e6c7bcf9f596bc01192d022c)]:
  - @graphql-mesh/transport-common@0.7.25
  - @graphql-tools/executor-common@0.0.1

## 0.5.15

### Patch Changes

- [#373](https://github.com/graphql-hive/gateway/pull/373) [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-tools/utils@^10.7.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.7.0) (from `^10.6.2`, in `dependencies`)

- [#373](https://github.com/graphql-hive/gateway/pull/373) [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2) Thanks [@ardatan](https://github.com/ardatan)! - Use `registerAbortSignalListener` helper function to register event listeners to `AbortSignal` instances to avoid warning on Node.js like
  `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 abort listeners added. Use emitter.setMaxListeners() to increase limit`.
- Updated dependencies [[`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2), [`15975c2`](https://github.com/graphql-hive/gateway/commit/15975c28daddbb4f31d520371f53520aecacaac7)]:
  - @graphql-mesh/transport-common@0.7.24

## 0.5.14

### Patch Changes

- Updated dependencies [[`23b8987`](https://github.com/graphql-hive/gateway/commit/23b89874fcf10b4cb6b1b941f29fa5f5aecf0ef2)]:
  - @graphql-mesh/transport-common@0.7.23

## 0.5.13

### Patch Changes

- [#291](https://github.com/graphql-hive/gateway/pull/291) [`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.9` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.9) (from `^0.4.8`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/types@^0.103.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.6) (from `^0.103.4`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.6` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.6) (from `^0.103.4`, in `dependencies`)
  - Updated dependency [`tslib@^2.8.1` ↗︎](https://www.npmjs.com/package/tslib/v/2.8.1) (from `^2.4.0`, in `dependencies`)

- Updated dependencies [[`34d1224`](https://github.com/graphql-hive/gateway/commit/34d12249ead65b8277df976f6318dca757df1151)]:
  - @graphql-mesh/transport-common@0.7.22

## 0.5.12

### Patch Changes

- [#269](https://github.com/graphql-hive/gateway/pull/269) [`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-tools/utils@^10.6.2` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.6.2) (from `^10.6.0`, in `dependencies`)

- Updated dependencies [[`cdca511`](https://github.com/graphql-hive/gateway/commit/cdca5116ce30c2bfced1130c9fbead67280af9d4)]:
  - @graphql-mesh/transport-common@0.7.21

## 0.5.11

### Patch Changes

- Updated dependencies []:
  - @graphql-mesh/transport-common@0.7.20

## 0.5.10

### Patch Changes

- Updated dependencies []:
  - @graphql-mesh/transport-common@0.7.19

## 0.5.9

### Patch Changes

- Updated dependencies []:
  - @graphql-mesh/transport-common@0.7.18

## 0.5.8

### Patch Changes

- [#205](https://github.com/graphql-hive/gateway/pull/205) [`2e0add3`](https://github.com/graphql-hive/gateway/commit/2e0add3ea9b237ad385d5b5cd4c12eeeb847805a) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@whatwg-node/fetch@^0.10.1` ↗︎](https://www.npmjs.com/package/@whatwg-node/fetch/v/0.10.1) (from `^0.10.0`, in `dependencies`)

- Updated dependencies []:
  - @graphql-mesh/transport-common@0.7.17

## 0.5.7

### Patch Changes

- [#164](https://github.com/graphql-hive/gateway/pull/164) [`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-tools/utils@^10.6.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.6.0) (from `^10.5.6`, in `dependencies`)

- [#180](https://github.com/graphql-hive/gateway/pull/180) [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/types@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.4) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.4) (from `^0.103.1`, in `dependencies`)

- [#185](https://github.com/graphql-hive/gateway/pull/185) [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/types@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.4) (from `^0.103.0`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.4) (from `^0.103.1`, in `dependencies`)

- [#98](https://github.com/graphql-hive/gateway/pull/98) [`697308d`](https://github.com/graphql-hive/gateway/commit/697308df3b2dd96f28dc65a5f5361a911077e022) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/cross-helpers@^0.4.8` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.8) (from `^0.4.7`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.1` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.1) (from `^0.103.0`, in `dependencies`)

- Updated dependencies [[`310613d`](https://github.com/graphql-hive/gateway/commit/310613d68d1df3e2bceafbd0730084a4c83527bf), [`9438e21`](https://github.com/graphql-hive/gateway/commit/9438e21982ed5c6fb18cb678b275046595ae00f5), [`f0b6921`](https://github.com/graphql-hive/gateway/commit/f0b69219fefc1b24c5511a1c623a5e3bbaf5ca0b)]:
  - @graphql-mesh/transport-common@0.7.16

## 0.5.6

### Patch Changes

- [#148](https://github.com/graphql-hive/gateway/pull/148) [`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/types@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.0) (from `^0.102.12`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.0) (from `^0.102.12`, in `dependencies`)

- [#150](https://github.com/graphql-hive/gateway/pull/150) [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f) Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/types@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.0) (from `^0.102.12`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.0` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.0) (from `^0.102.12`, in `dependencies`)

- Updated dependencies [[`f32cb2a`](https://github.com/graphql-hive/gateway/commit/f32cb2a0289aa32e4811ced5dc1aac3efb0674f1), [`c0e189a`](https://github.com/graphql-hive/gateway/commit/c0e189ac83901da3a101f16f151e859ff7cca19f)]:
  - @graphql-mesh/transport-common@0.7.15

## 0.5.5

### Patch Changes

- [`19bc6a4`](https://github.com/graphql-hive/gateway/commit/19bc6a4c222ff157553785ea16760888cdfe10bb) Thanks [@enisdenjo](https://github.com/enisdenjo)! - `onError` and `onEnd` callbacks when mapping async iterators are invoked only once regardless of how many times throw/return was called on the iterator

- Updated dependencies [[`73c621d`](https://github.com/graphql-hive/gateway/commit/73c621d98a4e6ca134527e349bc71223c03d06db), [`19bc6a4`](https://github.com/graphql-hive/gateway/commit/19bc6a4c222ff157553785ea16760888cdfe10bb)]:
  - @graphql-mesh/transport-common@0.7.14

## 0.5.4

### Patch Changes

- [#7914](https://github.com/ardatan/graphql-mesh/pull/7914)
  [`eee53b9`](https://github.com/ardatan/graphql-mesh/commit/eee53b9f455653166c39bca627b3261fbefe4eb7)
  Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency
    [`@whatwg-node/fetch@^0.10.0` ↗︎](https://www.npmjs.com/package/@whatwg-node/fetch/v/0.10.0)
    (from `^0.9.18`, in `dependencies`)
- Updated dependencies
  [[`eee53b9`](https://github.com/ardatan/graphql-mesh/commit/eee53b9f455653166c39bca627b3261fbefe4eb7)]:
  - @graphql-mesh/utils@0.102.12
  - @graphql-mesh/transport-common@0.7.13

## 0.5.3

### Patch Changes

- Updated dependencies
  [[`de41fc2`](https://github.com/ardatan/graphql-mesh/commit/de41fc2932433f8da35b9de9492720e6c8c100af),
  [`de41fc2`](https://github.com/ardatan/graphql-mesh/commit/de41fc2932433f8da35b9de9492720e6c8c100af)]:
  - @graphql-mesh/transport-common@0.7.12
  - @graphql-mesh/utils@0.102.11

## 0.5.2

### Patch Changes

- Updated dependencies
  [[`997b81c`](https://github.com/ardatan/graphql-mesh/commit/997b81c8a5d28508057806b4f16eecc5b713cf71),
  [`997b81c`](https://github.com/ardatan/graphql-mesh/commit/997b81c8a5d28508057806b4f16eecc5b713cf71)]:
  - @graphql-mesh/transport-common@0.7.11
  - @graphql-mesh/utils@0.102.10

## 0.5.1

### Patch Changes

- Updated dependencies
  [[`fad4d27`](https://github.com/ardatan/graphql-mesh/commit/fad4d27bfebb80a374c2041b86ffab509845effe)]:
  - @graphql-mesh/utils@0.102.9
  - @graphql-mesh/transport-common@0.7.10

## 0.5.0

### Minor Changes

- [#7766](https://github.com/ardatan/graphql-mesh/pull/7766)
  [`cc53c6c`](https://github.com/ardatan/graphql-mesh/commit/cc53c6c6056dcb38477b260e916825d4c8864b57)
  Thanks [@ardatan](https://github.com/ardatan)! - Fix/Implement WebSockets support for the Gateway
  and Client communication

### Patch Changes

- Updated dependencies
  [[`518c42c`](https://github.com/ardatan/graphql-mesh/commit/518c42c5a2bee00e224df95c2beb758a28d1323c),
  [`518c42c`](https://github.com/ardatan/graphql-mesh/commit/518c42c5a2bee00e224df95c2beb758a28d1323c)]:
  - @graphql-mesh/transport-common@0.7.9
  - @graphql-mesh/utils@0.102.8

## 0.4.2

### Patch Changes

- [#7781](https://github.com/ardatan/graphql-mesh/pull/7781)
  [`50bf472`](https://github.com/ardatan/graphql-mesh/commit/50bf4723657d27dc196d80407bda40c93aa5c9be)
  Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency
    [`@graphql-tools/utils@^10.5.5` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.5.5)
    (from `^10.5.3`, in `dependencies`)
- Updated dependencies
  [[`50bf472`](https://github.com/ardatan/graphql-mesh/commit/50bf4723657d27dc196d80407bda40c93aa5c9be),
  [`50bf472`](https://github.com/ardatan/graphql-mesh/commit/50bf4723657d27dc196d80407bda40c93aa5c9be),
  [`50bf472`](https://github.com/ardatan/graphql-mesh/commit/50bf4723657d27dc196d80407bda40c93aa5c9be)]:
  - @graphql-mesh/cross-helpers@0.4.7
  - @graphql-mesh/transport-common@0.7.8
  - @graphql-mesh/utils@0.102.7

## 0.4.1

### Patch Changes

- Updated dependencies
  [[`bf588d3`](https://github.com/ardatan/graphql-mesh/commit/bf588d372c0078378aaa24beea2da794af7949e6)]:
  - @graphql-mesh/utils@0.102.6
  - @graphql-mesh/transport-common@0.7.7

## 0.4.0

### Minor Changes

- [#7580](https://github.com/ardatan/graphql-mesh/pull/7580)
  [`75e9f63`](https://github.com/ardatan/graphql-mesh/commit/75e9f63d09514a0af786f909dc8c32ac09a1a849)
  Thanks [@ardatan](https://github.com/ardatan)! - BREAKING: All types prefixed with `MeshServe`,
  now are prefixed with `Gateway`. e.g. `MeshServeRuntime` -> `GatewayRuntime`

  Runtime factory is renamed; `createServeRuntime` -> `createGatewayRuntime`

  The expected export name for config files are renamed from `serveConfig` to `gatewayConfig`

  RENAMING:

  You can rename the product, config file name etc by using the following config options;

  For example;

  ```ts
  productName = 'Mesh Gateway';
  productDescription =
    'Mesh Gateway is a GraphQL Gateway that can be used to serve a supergraph schema.';
  productLogo = '<svg>...</svg>';
  productPackageName = '@graphql-mesh/gateway';
  ```

### Patch Changes

- Updated dependencies
  [[`3bf14b3`](https://github.com/ardatan/graphql-mesh/commit/3bf14b33ee621cce004a329928b8a04a68218016),
  [`b7f6ebf`](https://github.com/ardatan/graphql-mesh/commit/b7f6ebfa077957c3a1ecad1fed449e972cb09ae0),
  [`0a3e52c`](https://github.com/ardatan/graphql-mesh/commit/0a3e52c2ad2941e7c48f0e80706db41644797c2d)]:
  - @graphql-mesh/utils@0.102.5
  - @graphql-mesh/transport-common@0.7.6

## 0.3.5

### Patch Changes

- Updated dependencies
  [[`5146df0`](https://github.com/ardatan/graphql-mesh/commit/5146df0fd3313227d5d7df2beb726ca89e13923f)]:
  - @graphql-mesh/transport-common@0.7.5

## 0.3.4

### Patch Changes

- Updated dependencies
  [[`edbc074`](https://github.com/ardatan/graphql-mesh/commit/edbc074523ebc86114bb3342f86b7bcd9268d005),
  [`edbc074`](https://github.com/ardatan/graphql-mesh/commit/edbc074523ebc86114bb3342f86b7bcd9268d005)]:
  - @graphql-mesh/transport-common@0.7.4
  - @graphql-mesh/utils@0.102.4

## 0.3.3

### Patch Changes

- Updated dependencies
  [[`14ec31f`](https://github.com/ardatan/graphql-mesh/commit/14ec31f95bc06e9a3d06fae387fc40cc534e01f4),
  [`14ec31f`](https://github.com/ardatan/graphql-mesh/commit/14ec31f95bc06e9a3d06fae387fc40cc534e01f4)]:
  - @graphql-mesh/transport-common@0.7.3
  - @graphql-mesh/utils@0.102.3

## 0.3.2

### Patch Changes

- Updated dependencies
  [[`5d95aad`](https://github.com/ardatan/graphql-mesh/commit/5d95aad185448e8e3a004a08e364f98ee9bbee2a)]:
  - @graphql-mesh/utils@0.102.2
  - @graphql-mesh/transport-common@0.7.2

## 0.3.1

### Patch Changes

- Updated dependencies
  [[`e49a7e6`](https://github.com/ardatan/graphql-mesh/commit/e49a7e69475b652a53a0f289a44247e8b7ea96de),
  [`60bfc22`](https://github.com/ardatan/graphql-mesh/commit/60bfc2240108af0a599a66451517a146cace879d)]:
  - @graphql-mesh/utils@0.102.1
  - @graphql-mesh/transport-common@0.7.1

## 0.3.0

### Patch Changes

- Updated dependencies
  [[`13fa835`](https://github.com/ardatan/graphql-mesh/commit/13fa835036c3671305fc831fa236f110c33d9965)]:
  - @graphql-mesh/string-interpolation@0.5.6
  - @graphql-mesh/utils@0.102.0
  - @graphql-mesh/transport-common@0.7.0

## 0.2.2

### Patch Changes

- [#7518](https://github.com/ardatan/graphql-mesh/pull/7518)
  [`b0cdc83`](https://github.com/ardatan/graphql-mesh/commit/b0cdc839699a1dd90d125289b49b75f703cbb18e)
  Thanks [@enisdenjo](https://github.com/enisdenjo)! - dependencies updates:
  - Updated dependency
    [`@graphql-mesh/transport-common@^0.6.1` ↗︎](https://www.npmjs.com/package/@graphql-mesh/transport-common/v/0.6.1)
    (from `^0.6.0`, in `dependencies`)

## 0.2.1

### Patch Changes

- [#7516](https://github.com/ardatan/graphql-mesh/pull/7516)
  [`67e1062`](https://github.com/ardatan/graphql-mesh/commit/67e10629c70ec553234c1ffc99af4b89ddb31985)
  Thanks [@enisdenjo](https://github.com/enisdenjo)! - Transport's kind doesn't need to be typed

- Updated dependencies
  [[`67e1062`](https://github.com/ardatan/graphql-mesh/commit/67e10629c70ec553234c1ffc99af4b89ddb31985)]:
  - @graphql-mesh/transport-common@0.6.1

## 0.2.0

### Patch Changes

- [#7497](https://github.com/ardatan/graphql-mesh/pull/7497)
  [`d784488`](https://github.com/ardatan/graphql-mesh/commit/d784488dcf04b3b0bf32f386baf8b48e1f20d27e)
  Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency
    [`@graphql-tools/utils@^10.5.2` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.5.2)
    (from `^10.3.4`, in `dependencies`)

- [#7512](https://github.com/ardatan/graphql-mesh/pull/7512)
  [`190e9ec`](https://github.com/ardatan/graphql-mesh/commit/190e9ece9bc050a0564f3b5292ab5229e63d40a6)
  Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency
    [`@graphql-tools/utils@^10.5.3` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.5.3)
    (from `^10.5.2`, in `dependencies`)
- Updated dependencies
  [[`d784488`](https://github.com/ardatan/graphql-mesh/commit/d784488dcf04b3b0bf32f386baf8b48e1f20d27e),
  [`190e9ec`](https://github.com/ardatan/graphql-mesh/commit/190e9ece9bc050a0564f3b5292ab5229e63d40a6),
  [`d784488`](https://github.com/ardatan/graphql-mesh/commit/d784488dcf04b3b0bf32f386baf8b48e1f20d27e),
  [`190e9ec`](https://github.com/ardatan/graphql-mesh/commit/190e9ece9bc050a0564f3b5292ab5229e63d40a6),
  [`d784488`](https://github.com/ardatan/graphql-mesh/commit/d784488dcf04b3b0bf32f386baf8b48e1f20d27e),
  [`190e9ec`](https://github.com/ardatan/graphql-mesh/commit/190e9ece9bc050a0564f3b5292ab5229e63d40a6),
  [`d784488`](https://github.com/ardatan/graphql-mesh/commit/d784488dcf04b3b0bf32f386baf8b48e1f20d27e)]:
  - @graphql-mesh/cross-helpers@0.4.6
  - @graphql-mesh/transport-common@0.6.0
  - @graphql-mesh/utils@0.101.0

## 0.1.0

### Patch Changes

- [#7477](https://github.com/ardatan/graphql-mesh/pull/7477)
  [`c06a048`](https://github.com/ardatan/graphql-mesh/commit/c06a0482e7431683f0b75fde3aebbb97aca00c4c)
  Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Updated dependency
    [`@graphql-tools/utils@^10.3.4` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.3.4)
    (from `^10.2.3`, in `dependencies`)
- Updated dependencies
  [[`c06a048`](https://github.com/ardatan/graphql-mesh/commit/c06a0482e7431683f0b75fde3aebbb97aca00c4c),
  [`c06a048`](https://github.com/ardatan/graphql-mesh/commit/c06a0482e7431683f0b75fde3aebbb97aca00c4c),
  [`c06a048`](https://github.com/ardatan/graphql-mesh/commit/c06a0482e7431683f0b75fde3aebbb97aca00c4c),
  [`a324c5e`](https://github.com/ardatan/graphql-mesh/commit/a324c5ef300c25dcfa265f3457453b50af0b83e7),
  [`4d1eb28`](https://github.com/ardatan/graphql-mesh/commit/4d1eb285c2b703c5f80473ad0f316004306fac7f),
  [`a324c5e`](https://github.com/ardatan/graphql-mesh/commit/a324c5ef300c25dcfa265f3457453b50af0b83e7)]:
  - @graphql-mesh/cross-helpers@0.4.5
  - @graphql-mesh/transport-common@0.5.0
  - @graphql-mesh/utils@0.100.0

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @graphql-mesh/utils@0.99.7
  - @graphql-mesh/transport-common@0.4.7

## 0.0.5

### Patch Changes

- Updated dependencies
  [[`6c67e77`](https://github.com/ardatan/graphql-mesh/commit/6c67e77d3c308615a733577293ecb6dd55793aeb),
  [`6c67e77`](https://github.com/ardatan/graphql-mesh/commit/6c67e77d3c308615a733577293ecb6dd55793aeb),
  [`6c67e77`](https://github.com/ardatan/graphql-mesh/commit/6c67e77d3c308615a733577293ecb6dd55793aeb),
  [`6c67e77`](https://github.com/ardatan/graphql-mesh/commit/6c67e77d3c308615a733577293ecb6dd55793aeb)]:
  - @graphql-mesh/transport-common@0.4.6
  - @graphql-mesh/utils@0.99.6

## 0.0.4

### Patch Changes

- [#7401](https://github.com/ardatan/graphql-mesh/pull/7401)
  [`33c23e8`](https://github.com/ardatan/graphql-mesh/commit/33c23e83a60328df806a8adc8d262a0c6de7e5a4)
  Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:
  - Added dependency
    [`@graphql-mesh/utils@^0.99.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.99.4)
    (to `dependencies`)
- Updated dependencies
  [[`33c23e8`](https://github.com/ardatan/graphql-mesh/commit/33c23e83a60328df806a8adc8d262a0c6de7e5a4)]:
  - @graphql-mesh/utils@0.99.5
  - @graphql-mesh/transport-common@0.4.5

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @graphql-mesh/transport-common@0.4.4

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @graphql-mesh/transport-common@0.4.3

## 0.0.1

### Patch Changes

- [#7334](https://github.com/ardatan/graphql-mesh/pull/7334)
  [`22ebcf0`](https://github.com/ardatan/graphql-mesh/commit/22ebcf09d14ddc2da055f566c0e8e08f7428e141)
  Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Added dependency
    [`@graphql-mesh/cross-helpers@^0.4.4` ↗︎](https://www.npmjs.com/package/@graphql-mesh/cross-helpers/v/0.4.4)
    (to `dependencies`)

- [#7294](https://github.com/ardatan/graphql-mesh/pull/7294)
  [`345a814`](https://github.com/ardatan/graphql-mesh/commit/345a81490f5201f6ee2f378b1b9d83c5881c9730)
  Thanks [@ardatan](https://github.com/ardatan)! - Support for HTTP Callback protocol for
  subscriptions

  ```ts
      reviews: {
        kind: 'hybrid',
        options: {
          subscriptions: {
            kind: 'http-callback',
          },
        } satisfies HybridTransportOptions<HTTPCallbackTransportOptions>,
      },
  ```

  Learn more about protocol;
  https://www.apollographql.com/docs/router/executing-operations/subscription-callback-protocol/

- Updated dependencies
  [[`b01f3ea`](https://github.com/ardatan/graphql-mesh/commit/b01f3eabdc42d8905e8d586a4845e8394c094033),
  [`0bdc18d`](https://github.com/ardatan/graphql-mesh/commit/0bdc18df3d150a61abf987b8829934ed4ca02eed),
  [`4bc495c`](https://github.com/ardatan/graphql-mesh/commit/4bc495c03493f18c85e11f3f5fb54b3c35d16d8e),
  [`345a814`](https://github.com/ardatan/graphql-mesh/commit/345a81490f5201f6ee2f378b1b9d83c5881c9730)]:
  - @graphql-mesh/string-interpolation@0.5.5
  - @graphql-mesh/transport-common@0.4.2
