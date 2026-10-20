---
'@graphql-tools/stitch': patch
'@graphql-tools/stitching-directives': patch
'@graphql-tools/delegate': patch
---

Port leftover Schema Stitching PRs from `ardatan/graphql-tools` into Hive Gateway and fix the underlying bugs:

- Allow `@merge` without `keyArg` when the resolver takes zero arguments ([graphql-tools#4337](https://github.com/ardatan/graphql-tools/pull/4337)); keyless merges keep a stub so type merging can fill remaining fields
- Preserve `mutation` (but not `subscription`) as the operation for merged type resolvers ([graphql-tools#4549](https://github.com/ardatan/graphql-tools/pull/4549))
- Fix union merges queried with inline fragments: register abstract types for `@merge`, support union merged types, and flatten inline-fragment spreads that `visit` would otherwise nest ([graphql-tools#4965](https://github.com/ardatan/graphql-tools/pull/4965) / [#4966](https://github.com/ardatan/graphql-tools/issues/4966))
- Add coverage for interfering `RenameInputObjectFields` transforms ([graphql-tools#5093](https://github.com/ardatan/graphql-tools/pull/5093))
