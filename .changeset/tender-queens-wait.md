---
'@graphql-tools/wrap': patch
---

`RenameObjectFieldArguments` should transform the passed `args` in `delegationContext`.

When a subschema's a root field argument is renamed, the passed arguments should be also transformed;

```graphql
type Query {
    # This is the original field
    book(book_id: ID): [Book]
}

type Book {
    id: ID
    title: String
}
```

When the subschema above is transformed to;

```graphql
type Query {
    # This is the transformed field
    book(bookId: ID): [Book]
}

type Book {
    id: ID
    title: String
}
```

The following call should be transformed;

```ts
delegateToSchema({
    schema: {
        schema,
        transforms: [
            new RenameObjectFieldArguments((typeName, fieldName, argName) => {
                if (typeName === 'Query' && fieldName === 'book' && argName === 'book_id') {
                    return 'bookId';
                }
                return argName;
            })
        ]
    },
    operation: 'query',
    fieldName: 'book',
    args: {
        bookId: '1'
    }
})
```

To this query;

```graphql
{
    book(book_id: "1") {
        # ...
    }
}
```