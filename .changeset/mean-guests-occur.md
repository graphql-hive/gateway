---
'@graphql-tools/delegate': patch
---

Add `isPrototypePollutingKey` to prevent accidential prototype pollution, whenever object manipulation happens with the keys based on the user input, it is validated to prevent prototype pollution.

For example, `WrapQuery` takes `path` which is used to manipulate the object returned to the client. If the user input is `__proto__`, it will throw an error from now on but previously it would have polluted the prototype.
