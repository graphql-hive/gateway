---
"@graphql-hive/gateway": patch
"@graphql-hive/router-runtime": minor
---

Add support for the `BatchFetch` plan node. When the query planner groups compatible entity fetches into a single `BatchFetch` node, the gateway runtime now executes them as one subgraph request with aliased `_entities` calls, reducing the number of downstream HTTP requests.
