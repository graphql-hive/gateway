---
'@graphql-tools/stitch': patch
'@graphql-tools/stitching-directives': patch
---

Allow `@merge` without `keyArg` when the resolver takes zero arguments, and make keyless type merges work when the initial subschema cannot satisfy the requested fields ([graphql-tools#4337](https://github.com/ardatan/graphql-tools/pull/4337)).

Previously the validator rejected `@merge` on zero-arg fields (`args.length !== 1`). It now allows zero or one argument and only errors when there are multiple args without `keyArg` / `argsExpr`.

Separately, keyless merges such as:

```ts
merge: {
  Stats: {
    fieldName: 'stats',
    args: () => ({}),
  },
}
```

had no key `selectionSet`. When the subschema that owned `Query.stats` did not have the requested fields (for example querying only `totalChirps` while that field lived on the other subschema), `finalizeGatewayRequest` stripped the empty nested selection and failed with "The request must contain at least one operation."

For merged types that have resolvers but no key `selectionSet`, stitching now injects `__typename` into `fieldNodesByType` so a stub object remains and type merging can fill the remaining fields. This matches the partial-field failure called out in [this discussion](https://github.com/ardatan/graphql-tools/pull/4337#issuecomment-1086893317). Keyed merges (`selectionSet: '{ id }'`) are unchanged.
