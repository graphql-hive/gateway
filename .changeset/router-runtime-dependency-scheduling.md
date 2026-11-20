---
'@graphql-hive/router-runtime': minor
---

Run every subgraph fetch as soon as the fetches it needs data from are done

The query plan now says which fetches each fetch waits for, so a fetch no longer waits for unrelated siblings. In `{ topProducts { inStock reviews { author { name } } } }`, the authors are fetched as soon as the reviews arrive, even when the stock is still loading.

The router runtime also takes the entity keys, the possible types of abstract types and the shape of the response straight from the query planner, instead of working them out from the supergraph for every request.

Other changes you may notice:

- Query plans exposed through `onQueryPlan`, `extensions.queryPlan` and the shared query plan cache now include the shape of the response (`projection`), the `id` and `dependsOn` of every fetch, and the `completes` of every batch fetch.
- Query plans in the shared cache are now kept per query planner version. Plans cached by an earlier version are not reused, they are planned again.
- A custom scalar holding an object is replaced as a whole when two subgraphs return it for the same field, instead of being merged.
- When two subgraphs return the same field, a `null` from one of them no longer overwrites the value from the other.
