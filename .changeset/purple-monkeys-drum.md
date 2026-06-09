---
'@graphql-tools/stitch': patch
---

Fix `mergeDirectives` option and default it to `true`

Custom directive definitions from subschemas were silently dropped from the stitched schema unless `mergeDirectives: true` was explicitly passed to `stitchSchemas`. This meant a schema like:

```graphql
directive @public on SCHEMA | OBJECT | FIELD_DEFINITION

type Query @public {
  isAnExample: Boolean @public
}
```

would stitch into a broken schema where `@public` was used on types and fields but never defined.

The default is now `true`, so directive definitions are always collected and retained in the stitched schema, this is the expected behaviour since the merging was partial before this fix (usages got merged, but definitions not).

Passing `mergeDirectives: false` now produces a fully clean result - both directive definitions and all their usages on types, fields, input fields, and enum values are stripped.
