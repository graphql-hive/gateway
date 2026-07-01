---
'@graphql-tools/batch-execute': patch
---

Fix `DataLoader must be constructed with a function which accepts Array<key> and returns Promise<Array<value>>, but the function did not return a Promise of an Array` thrown when a batched subgraph response omits some of the merged sub-requests.

`splitResult` builds `new Array(numResults)` and only assigns the indices present in the merged response's `data`/`errors`. When a subgraph answers only some of the batched operations — returning neither a data key nor a path-scoped error for the rest — those slots stay holes. A hole at the trailing slot fails DataLoader's `isArrayLike` check (which requires `hasOwnProperty(length - 1)`) even though `Array.isArray` is `true`, so the batching executor's DataLoader throws. The result is now densified to `numResults`, filling any missing slot with an empty `ExecutionResult`.

This mirrors the sibling fix for `@graphql-tools/batch-delegate` in #2393.
