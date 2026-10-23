---
'@graphql-tools/stitch': patch
---

Resolve a merged-type field whose merge key is unsatisfiable to `null` instead
of hanging the request.

When a stitched query requested a merged-type field that could not be delegated
because the parent could not satisfy the merge key, the field was recorded as a
delegation leftover whose deferred was only ever settled from a follow-up fetch.
That fetch never fired for an unsatisfiable key, so the deferred stayed pending
and the whole request hung until the outer timeout.

`createDelegationPlanBuilder` now records a leftover only for the fields a
non-proxiable subschema can actually resolve (its merge key is satisfiable from
the accumulated source subschemas). A field with no satisfiable path falls
through to `defaultMergedResolver`'s `undefined` branch and resolves to `null`.

Note: a field whose unsatisfiable dependency is a COMPUTED-FIELD dependency
(`fields: { x: { selectionSet } }`) rather than the merge key is handled in the
delegate layer's deferred path and is not addressed here; it needs a
complementary change in `@graphql-tools/delegate`.
