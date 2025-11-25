---
'@graphql-tools/delegate': patch
'@graphql-tools/stitch': patch
---

Avoid extra `__typename` in the root selection

```diff
query {
- __typename
  hello
}
```