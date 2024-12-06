---
'@graphql-hive/gateway-runtime': patch
---

Fixes the bug when the fetcher given in subgraph called multiple times, so in the CLI when you point to a file for subgraph file, it fetches the subgraph on each request.
