---
'@graphql-hive/router-runtime': patch
---

Less CPU and memory per request

Entities are collected into parallel arrays, duplicate entities are resolved by their key without projecting them again, the projection is compiled once per plan and builds the response from plain objects, each subgraph's transforms are looked up once, and introspection is told apart without visiting the whole document. A plan that failed is planned again instead of its rejection being cached.
