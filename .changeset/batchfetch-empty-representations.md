---
"@graphql-hive/router-runtime": patch
---

Fix `BatchFetch` execution dropping the `$representations` variable for an entity alias that resolved to zero representations.

When a `BatchFetch` plan node groups several entity fetches for the same subgraph into one aliased `_entities` request and one alias resolves to an empty representation list (e.g. a nullable federated field that is `null`), `buildBatchFetchVariables` omitted that alias's variable. The batched document still declares it as a required `[_Any!]!`, so the operation declared a variable it never provided and the subgraph rejected the whole request — failing the sibling aliases that *did* have representations.

Empty aliases now send `[]`, keeping the operation valid (`_entities(representations: [])` simply returns `[]`).
