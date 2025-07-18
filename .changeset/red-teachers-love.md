---
'@graphql-hive/plugin-aws-sigv4': patch
'@graphql-mesh/fusion-runtime': patch
'@graphql-tools/batch-execute': patch
'@graphql-tools/delegate': patch
'@graphql-hive/gateway-runtime': patch
'@graphql-tools/wrap': patch
---

Fixed subgraph name being lost when execution requests get batched together.
