---
'@graphql-tools/stitch': patch
'@graphql-tools/stitching-directives': patch
'@graphql-tools/delegate': patch
---

Fix type merging for unions queried with inline fragments ([graphql-tools#4965](https://github.com/ardatan/graphql-tools/pull/4965) / [#4966](https://github.com/ardatan/graphql-tools/issues/4966)).

Typical setup: one subschema returns a stub member (`StubMajor { id }`) while another resolves the real union members via `@merge`:

```graphql
# students
union Major = StubMajor
type StubMajor { id: String! }

# majors
type Query {
  major(id: String!): Major @merge(keyField: "id")
}
union Major = MajorSuccess | MajorError
```

Client query:

```graphql
major {
  ... on MajorSuccess { id name }
  ... on MajorError { id code }
}
```

Three problems stacked:

1. `@merge` on a union only registered concrete members (`MajorSuccess` / `MajorError`), not `Major` itself, so a `StubMajor` result never triggered merge.
2. `MergedTypeInfo` was not built for union types, and planners assumed object/interface `getFields()`.
3. Expanding a bare merge-key field (`id`) on a union into `... on StubMajor { id }` returned an **array** from the FIELD visitor; graphql-js `visit` nests that array as one selection instead of splicing it, so execution ignored the fragment and the merge key was never queried (`major(id: $id)` ran with empty variables).

Fixes:

- Register the abstract union/interface name for `@merge` as well as concrete members.
- Build merge info for unions; treat unions as field-less so the abstract planner re-fetches via inline fragments.
- Flatten nested selection arrays after union field expansion so stub keys are actually requested.

This goes beyond the [schema-extension workaround](https://github.com/ardatan/graphql-tools/issues/4966#issuecomment-1670713991) discussed on the issue.
