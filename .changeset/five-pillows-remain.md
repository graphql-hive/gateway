---
'@graphql-hive/router-runtime': patch
---

Handle listed enum values correctly
Previously when a field like `[MyEnum!]!` is projected, it was projecting it like it is `MyEnum`.