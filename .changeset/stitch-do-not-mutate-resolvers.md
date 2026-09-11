---
'@graphql-tools/stitch': patch
---

`stitchSchemas` no longer mutates the resolver objects passed in `resolvers`.

The wrapper it adds around resolvers of fields that return a merged type (so the merged type's fields get resolved) used to be written back into the caller's field config (`existing.resolve = wrappedResolve`). A resolver map reused across `stitchSchemas` calls — a gateway's additional resolvers on every supergraph reload — therefore gained one wrapper per call, and every wrapper kept its call's `stitchingInfo`, and with it the entire superseded schema, subschemas and executors, reachable: a heap leak of one schema generation per reload.

Nesting also changed behaviour, because `wrappedResolve` closes over its own call's `stitchingInfo` and the innermost (oldest) wrapper runs first: such a field hydrated through a superseded call's stitching plan and executors, and once that hydration satisfied the selection the newest wrapper found nothing left to resolve.

The merged resolver map is now cloned before the wrappers are added. Enum value maps, scalars, union and input type resolvers and plain resolver functions are still passed through by reference, so their identities are unchanged.
