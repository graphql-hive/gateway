---
'@graphql-tools/stitch': patch
'@graphql-mesh/fusion-runtime': patch
---

Fields that are not provided by any subschema (added through `typeDefs` or `resolvers`) can now return partial objects of merged types; the missing fields are resolved from the owning subschema automatically

```graphql
type Query {
  personCreated: PersonCreated
}

type PersonCreated {
  person: Person # merged type, owned by a subschema
  cursor: String
}
```

```ts
const resolvers = {
  Query: {
    // only the key of `Person` is provided locally
    personCreated: () => ({ person: { id: '1' }, cursor: 'c1' }),
  },
};
```

Before, `person` had to be resolved manually even though the stitched schema knows `Person` and its keys. Now the key is enough: `{ person { name } }` runs through the standard stitching planner, while local data (`cursor`) and local field resolvers on `Person` keep working as before. Computed fields, `@requires` dependencies, batching, and fields from other subschemas use the same type-merging flow as regular delegated results.
