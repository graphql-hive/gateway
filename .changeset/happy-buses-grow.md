---
'@graphql-tools/federation': patch
'@graphql-tools/delegate': patch
---

- Optimizations to select ONLY required fields when fetching the missing fields from other subgraphs
- Do not try to resolve types from the subschemas which only have the stub types, for example if a subgraph only has `id` field as a stub, do not use that subgraph as a target subgraph for resolving the type, because it will not have any other fields than `id`.