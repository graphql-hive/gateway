---
'@graphql-tools/stitch': patch
---

Apply function `selectionSet` dependencies during type-merge planning.

Gateway resolvers can declare a function `selectionSet` (e.g. via `forwardArgsToSelectionSet`) so required fields receive arguments from the gateway field. Those were only applied on direct delegation (`visitSelectionSet` → `dynamicSelectionSetsByField`). When an object was completed via type merging from another subschema, only static string `selectionSet`s (`fieldNodesByField`) were injected into the merge plan — so arg-dependent parent fields never arrived on the merged object.

`getFieldsNotInSubschema` now evaluates `dynamicSelectionSetsByField` for missing/computed fields the same way it already walks `fieldNodesByField`.
