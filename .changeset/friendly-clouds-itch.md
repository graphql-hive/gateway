---
'@graphql-hive/gateway-runtime': patch
'@graphql-mesh/fusion-runtime': patch
---

Handle serving subgraphs when;
- No entity is found
- Query root type has a different name than `Query`
- Federation transform by adding `@key` directive to a type but without a resolver
