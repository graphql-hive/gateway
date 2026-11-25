---
'@graphql-hive/gateway-runtime': minor
'@graphql-mesh/fusion-runtime': minor
'@graphql-hive/router-runtime': minor
---

New `entityReuse` option to copy entities already in the response instead of fetching them again

Off by default. Like Hive Router's `traffic_shaping.entity_reuse`, the query planner plans entity reuse and the Hive Router runtime copies the fields of an entity already in the response instead of sending it to the subgraph again. A fetch with nothing left to send isn't sent. It needs a `@graphql-hive/router-query-planner` that emits `entityReuse`, older planners ignore the option.
