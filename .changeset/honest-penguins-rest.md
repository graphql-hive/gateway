---
'@graphql-tools/delegate': patch
---

Fix enum argument serialization when delegating to a field removed from the transformed schema.

When a delegated query field is filtered from the transformed schema, its arguments now use the original subschema for type lookup. This ensures enum values are sent as typed variables instead of invalid quoted enum literals while preserving input field transforms for fields that remain exposed.
