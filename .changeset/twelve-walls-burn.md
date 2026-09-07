---
'@graphql-tools/batch-execute': minor
---

Fixes [#1288](https://github.com/graphql-hive/gateway/issues/1288).

Per the [GraphQL spec](https://spec.graphql.org/October2021/#sec-Handling-Field-Errors) a non-nullable field returning null should propagate to the parent, in this case it should propagate to data.
Batched sub-requests share one merged document so null should propagate to every result and not just the one whose fields actually failed.
