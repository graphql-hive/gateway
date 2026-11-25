---
'@graphql-hive/router-runtime': minor
---

Experimental: keep the data as the subgraphs' response bytes with `HIVE_ROUTER_RUNTIME_RESPONSE_TAPE=1`

The Hive Router runtime then tokenizes the subgraph responses into typed arrays instead of parsing them, merges them by linking their values, and writes the response straight from their bytes, for the query plans it can run that way, others keep parsed objects. It takes less CPU and memory per request, and a response written from the same deduplicated subgraph responses as the last one of its plan is sent as it is.
