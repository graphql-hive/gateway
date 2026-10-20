---
'@graphql-tools/stitch': patch
'@graphql-tools/stitching-directives': patch
---

Port leftover Schema Stitching PRs from `ardatan/graphql-tools` into Hive Gateway:

- Allow `@merge` without `keyArg` when the resolver takes zero arguments ([graphql-tools#4337](https://github.com/ardatan/graphql-tools/pull/4337))
- Preserve the parent operation type (query vs mutation) when creating merged type resolvers ([graphql-tools#4549](https://github.com/ardatan/graphql-tools/pull/4549))
- Add coverage for union merges with inline fragments ([graphql-tools#4965](https://github.com/ardatan/graphql-tools/pull/4965))
- Add coverage for interfering `RenameInputObjectFields` transforms ([graphql-tools#5093](https://github.com/ardatan/graphql-tools/pull/5093))
