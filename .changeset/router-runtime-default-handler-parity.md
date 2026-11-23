---
'@graphql-hive/router-runtime': patch
---

Respond like the default handler to bad variables and failed subgraph requests, and send the operation name to subgraphs

A variable that can't be coerced, like a string for an `Int` or an `@oneOf` input with two keys, is now responded to with HTTP 400 instead of 200.

When every fetch of an operation failed, like when the connection to the subgraph dropped, the response now has `data` with the failed fields set to `null`, and HTTP 200, instead of no `data` and HTTP 500.

The subgraph operations are named after the client's operation, and the name is sent as the `operationName` to the subgraph, like with the default handler. For `query Orders { orders }`, the subgraph receives `query Orders{orders}` with `"operationName": "Orders"`, which also shows up in the subgraph metrics and traces instead of `Anonymous`.

Closes #2773
