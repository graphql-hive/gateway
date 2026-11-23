---
'@graphql-hive/router-runtime': patch
---

Respond like the default handler to bad variables and failed subgraph requests

A variable that can't be coerced, like a string for an `Int` or an `@oneOf` input with two keys, is now responded to with HTTP 400 instead of 200.

When every fetch of an operation failed, like when the connection to the subgraph dropped, the response now has `data` with the failed fields set to `null`, and HTTP 200, instead of no `data` and HTTP 500.

Closes #2773
