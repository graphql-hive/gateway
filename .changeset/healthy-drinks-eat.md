---
'@graphql-tools/delegate': patch
---

Fix delegated argument serialization when fields are filtered or renamed

Inline enum values now remain enum literals, and original variable definitions are preserved while still referenced by fragments, selections, directives, or other arguments.
