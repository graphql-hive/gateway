---
'@graphql-hive/router-runtime': minor
'@graphql-hive/gateway-runtime': minor
'@graphql-mesh/fusion-runtime': minor
---

Run every subgraph fetch as soon as the fetches it needs data from are done

The query plan now says which fetches each fetch waits for, so a fetch no longer waits for unrelated siblings. In `{ topProducts { inStock reviews { author { name } } } }`, the authors are fetched as soon as the reviews arrive, even when the stock is still loading.

The router runtime also takes the entity keys, the possible types of abstract types and the shape of the response straight from the query planner, instead of working them out from the supergraph for every request.

`@fromContext` fetches now respect a configurable alias limit. Such a fetch sends one aliased `_entities` field per group of distinct context values, so a subgraph that caps the aliases of an operation could reject it. With `maxAliasesPerRequest` the groups are split into as many requests as it takes to stay within the limit, like the Hive Router's `traffic_shaping` `max_aliases_per_request` does. There is no limit by default.

```ts
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  // at most 15 aliases per request, and 4 for the accounts subgraph
  maxAliasesPerRequest: { '*': 15, accounts: 4 },
  // or the same limit for all subgraphs
  // maxAliasesPerRequest: 15,
});
```

The query planner decides how many groups go in one request now. Contextual arguments that are non-null are still fetched with one request per group.

Other changes you may notice:

- Query plans exposed through `onQueryPlan`, `extensions.queryPlan` and the shared query plan cache now include the shape of the response (`projection`), the `id` and `dependsOn` of every fetch, and the `completes` of every batch fetch.
- Query plans in the shared cache are now kept per query planner version and alias limits. Plans cached by an earlier version or with other limits are not reused, they are planned again.
- A custom scalar holding an object is replaced as a whole when two subgraphs return it for the same field, instead of being merged.
- When two subgraphs return the same field, a `null` from one of them no longer overwrites the value from the other.
