---
'@graphql-hive/logger': patch
---

Circular class instance now resolves to [Circular] instead of recursing forever

`objectifyClass` wasn't threading the visited `WeakSet` into its recursive `unwrapAttrVal` calls, so class instances referencing themselves never hit the cycle guard and will then stack overflow.
