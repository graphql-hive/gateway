---
'@graphql-tools/stitch': patch
'@graphql-tools/stitching-directives': patch
'@graphql-tools/wrap': patch
'@graphql-hive/gateway-runtime': patch
---

Fix running with GraphQL v17

- `stitchSchemas` handles interfaces from type definitions that implement no other interfaces.
- The experimental stitching executor passes variables to `getArgumentValues` in the shape GraphQL v17 expects.
- `federationToStitchingSDL` handles fields without directives.
- `wrapSchema` drops the `coerceInputValue`, `coerceInputLiteral`, `coerceOutputValue` and `valueToLiteral` functions of wrapped scalars, so values are coerced only by the subschema.
- `TransformEnumValues` renames enum values in argument defaults defined in SDL.
- Demand control reads the slicing arguments of `@listSize` when the operation uses variables.
