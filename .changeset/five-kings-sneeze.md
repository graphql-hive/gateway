---
'@graphql-hive/gateway-runtime': patch
---

Support aliased imports for Demand Control directives such as;

```graphql
extend schema @link(url: "...", import: [{ name: "@cost", as: "@myCost" }])
```

So in this case, `@myCost` will be available in the schema as `@myCost` instead of `@cost`.