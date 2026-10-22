---
'@graphql-tools/stitch': patch
---

Merged type resolvers now preserve the parent `mutation` operation when the merge entry point lives on `Mutation` ([graphql-tools#4549](https://github.com/ardatan/graphql-tools/pull/4549)).

Previously `createMergedTypeResolver` always used `operation: 'query'`. When type merging ran during a mutation and the merge entry point existed only under `Mutation` (or the subgraph rejected mutation fields executed as queries), merged fields came back null.

Example: two subschemas each expose `Mutation.zeroUser` / `Mutation.oneUser` as merge entry points for `User`. A client mutation that selects fields from both users now re-delegates those merges as mutations, so subgraphs that distinguish mutation vs query resolvers keep working.

Query-only merge fields (Federation `_entities`) still delegate as `query` even when the gateway operation is a mutation. Subscriptions are also unchanged: merges while resolving a subscription event use `query`, because you cannot re-subscribe for entity fields. Scope follows the [mutation-vs-query discussion](https://github.com/ardatan/graphql-tools/pull/4549#issuecomment-1173573076).
