---
'@graphql-tools/batch-delegate': patch
---

Fix `DataLoader must be constructed with a function which accepts Array<key> and returns Promise<Array<value>>, but the function did not return a Promise of an Array` thrown when the batch resolves to a sparse array.

When `valuesFromResults` (or the subschema result) leaves a hole at the trailing slot — for example when the last key in a batch has no matching row — the resulting array fails DataLoader's `isArrayLike` check (which requires `hasOwnProperty(length - 1)`), even though `Array.isArray` returns `true`. The batch result is now normalised to a dense array of `keys.length`, padding any missing entries with `null`.
