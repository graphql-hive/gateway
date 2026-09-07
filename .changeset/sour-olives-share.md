---
'@graphql-hive/router-runtime': patch
---

Fix prototype pollution when projecting a field aliased to `__proto__`

Response keys come from client-controlled GraphQL aliases. Projecting a selection set into a plain object made `result['__proto__']` resolve to `Object.prototype`, and the merge branch then assigned attacker-controlled fields onto it - polluting the global prototype for the lifetime of the gateway process.

Projected objects are now created with a `null` prototype, so `__proto__` is treated as an ordinary response key.
