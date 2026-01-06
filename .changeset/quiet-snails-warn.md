---
'@graphql-tools/delegate': patch
---

Delegate variable values correctly;

When delegating requests with variables that include nested arrays, ensure that null values are preserved and passed correctly to the subschema. This fix addresses issues where null values in nested arrays were not handled properly during delegation.

Let's say we have the following schema;

```ts
makeExecutableSchema({
    typeDefs: /* GraphQL */ `
        type Query {
            test(input: InputType!): [String!]
        }
        input InputType {
            value: [String!]
        }
    `,
    resolvers: {
        Query: {
            test: (_, args) => {
                // Returns the incoming variable value
                return args.input.value;
            },
        },
    }
});
```

When delegating a query with a variable like:

```json
{
    "query": "query Test($value: [String!]) { test(input: { value: $value } ) }",
    "variables": { "value": null }
}
```

And the result was
```json
{
    "data": {
        "test": []
    }
}
```

But with this fix, the result will correctly be:
```json
{
    "data": {
        "test": null
    }
}
```

