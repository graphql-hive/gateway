---
'@graphql-tools/delegate': patch
---

Reuse the existing variables from the gateway request correctly

When you have an argument in a nested field that uses the variable from the gateway request like below;

```graphql
    query GetArticles($date: Datetime!) {
        view {
          articlesByDate(date: $date) {
            id
            title
            publishedAt
          }
        }
      }
```

And if `Datetime` is renamed from `DateTime` in the original schema, the transform wasn't applied correctly to the variable definitions, and the delegation failed with an error in the subgraph like `Datetime` is not known.
