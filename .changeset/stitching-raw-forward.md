---
'@graphql-hive/gateway-runtime': minor
'@graphql-mesh/fusion-runtime': minor
---

Add the experimental `__experimental__rawForward` option

When a query has a single root field that is resolved by one subgraph request selecting exactly what the client selects, the response of the subgraph already is the response of the gateway. With this option the gateway checks the bytes of the subgraph response against the schema (shape, nullability, leaf types) and uses them as the response body, instead of parsing the body, building the result and serializing it again.

Operations that are not eligible, and responses that do not pass the check, are executed as before from the same subgraph response. The option is off by default and only applies to supergraphs executed by the default (stitching) runtime.
