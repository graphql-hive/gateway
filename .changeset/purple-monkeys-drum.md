---
'@graphql-tools/stitch': patch
---

Always retain directive definitions from subschemas in stitched schema

Custom directive definitions from subschemas were silently dropped from the stitched schema unless `mergeDirectives: true` was explicitly passed to `stitchSchemas`. This meant a schema like:

```graphql
directive @public on SCHEMA | OBJECT | FIELD_DEFINITION

type Query @public {
  isAnExample: Boolean @public
}
```

would stitch into:

```graphql
type Query @public {
  isAnExample: Boolean @public
}
```

The directive usages on types and fields were preserved (carried over via AST nodes through `mergeCandidates`), but the directive definitions themselves were dropped, producing a broken schema where directives are used but never defined.

`mergeDirectives` was flawed to begin with... `mergeDirectives: false` produced an internally inconsistent schema where directive usages existed on fields and types but the corresponding definitions were removed. The correct way to suppress directives from appearing in the stitched schema would have been to also strip their usages from field and type AST nodes - but that was never done. So `mergeDirectives: false` never achieved a clean "no directives" result, it just produced a broken one. In essence, fixing the `mergeDirectives: false` behavior would actually be a breaking change!

Having said all that, we've instead removed the `mergeDirectives` argument and guard so directives from subschemas are always collected. This is correct default behavior - a stitched schema should retain all directive definitions from its subschemas unconditionally. This is not breaking because it actually fixes the partial merge.
