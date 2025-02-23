# @graphql-hive/logger-json

## 0.0.2

### Patch Changes

- [#697](https://github.com/graphql-hive/gateway/pull/697) [`6cc87c6`](https://github.com/graphql-hive/gateway/commit/6cc87c6e9aa0cbb9eff517eeec92d57b9c96d39e) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-mesh/types@^0.103.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/types/v/0.103.18) (from `^0.103.16`, in `dependencies`)
  - Updated dependency [`@graphql-mesh/utils@^0.103.18` ↗︎](https://www.npmjs.com/package/@graphql-mesh/utils/v/0.103.18) (from `^0.103.16`, in `dependencies`)

## 0.0.1

### Patch Changes

- [#642](https://github.com/graphql-hive/gateway/pull/642) [`30e41a6`](https://github.com/graphql-hive/gateway/commit/30e41a6f5b97c42ae548564bce3f6e4a92b1225f) Thanks [@ardatan](https://github.com/ardatan)! - New JSON-based logger

  By default, it prints pretty still to the console unless NODE_ENV is production.
  For JSON output, set the `LOG_FORMAT` environment variable to `json`.
