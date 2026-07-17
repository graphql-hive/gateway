---
'@graphql-tools/delegate': patch
---

Fix delegated argument variable type compatibility

Avoid reusing variables whose types are incompatible with target schema argument types, and create correctly typed variables instead.
