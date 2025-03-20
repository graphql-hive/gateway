# @graphql-hive/importer

## 1.1.0

### Minor Changes

- [#865](https://github.com/graphql-hive/gateway/pull/865) [`dc8c4ce`](https://github.com/graphql-hive/gateway/commit/dc8c4ce642ecc8bb47d14002b196981f67c78c3c) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Respect NODE_PATH environment variable even when importing ESM modules

## 1.0.1

### Patch Changes

- [#642](https://github.com/graphql-hive/gateway/pull/642) [`30e41a6`](https://github.com/graphql-hive/gateway/commit/30e41a6f5b97c42ae548564bce3f6e4a92b1225f) Thanks [@ardatan](https://github.com/ardatan)! - New JSON-based logger

  By default, it prints pretty still to the console unless NODE_ENV is production.
  For JSON output, set the `LOG_FORMAT` environment variable to `json`.

## 1.0.0

### Major Changes

- [#462](https://github.com/graphql-hive/gateway/pull/462) [`9a6ae85`](https://github.com/graphql-hive/gateway/commit/9a6ae85470de66fa397c8f0f03e66f6919eddfdb) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Improving Hive's importing capabilities allowing it to parse TypeScript files
