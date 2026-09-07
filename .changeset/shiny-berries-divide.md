---
'@graphql-tools/federation': patch
'@graphql-tools/delegate': patch
---

Drop prototype polluting keys from subgraph results before merging them

Response keys named `__proto__`, `constructor` or `prototype`, which a client can produce with a field alias, were only filtered at the top level of a merged result. Nested occurrences were passed to `mergeDeep`, which walks the prototype chain and could end up writing to `Object.prototype` or `Function.prototype`.

Such keys are now removed at every depth of a subgraph result before it takes part in a merge, and `projectDataSelectionSet` no longer treats an inherited property as an already projected field.
