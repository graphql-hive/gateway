# @graphql-hive/gateway-abort-signal-any

## 0.0.3

### Patch Changes

- [#401](https://github.com/graphql-hive/gateway/pull/401) [`c60a8f4`](https://github.com/graphql-hive/gateway/commit/c60a8f446c5ca59a74a580050f5c20c0c9e61e97) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Updated dependency [`graphql@^15.0.0 || ^16.9.0 || ^17.0.0` ↗︎](https://www.npmjs.com/package/graphql/v/15.0.0) (from `^16.9.0 || ^17.0.0`, in `peerDependencies`)

## 0.0.2

### Patch Changes

- [#373](https://github.com/graphql-hive/gateway/pull/373) [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2) Thanks [@ardatan](https://github.com/ardatan)! - dependencies updates:

  - Added dependency [`@graphql-tools/utils@^10.7.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/utils/v/10.7.0) (to `dependencies`)
  - Added dependency [`graphql@^16.9.0 || ^17.0.0` ↗︎](https://www.npmjs.com/package/graphql/v/16.9.0) (to `peerDependencies`)

- [#373](https://github.com/graphql-hive/gateway/pull/373) [`e606975`](https://github.com/graphql-hive/gateway/commit/e60697593290255fb9ac407e591ae3e8cb752df2) Thanks [@ardatan](https://github.com/ardatan)! - Use `registerAbortSignalListener` helper function to register event listeners to `AbortSignal` instances to avoid warning on Node.js like
  `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 abort listeners added. Use emitter.setMaxListeners() to increase limit`.

## 0.0.1

### Patch Changes

- [#322](https://github.com/graphql-hive/gateway/pull/322) [`23b8987`](https://github.com/graphql-hive/gateway/commit/23b89874fcf10b4cb6b1b941f29fa5f5aecf0ef2) Thanks [@ardatan](https://github.com/ardatan)! - New package
