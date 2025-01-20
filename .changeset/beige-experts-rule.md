---
'@graphql-tools/delegate': patch
---

While creating a delegation request for the subschema, an selection set should be spreaded on the union type field correctly.

In case of the following schema;

```graphql
type Query {
    foo: Foo
}

union Foo = Bar | Baz

type Bar {
    id: ID!
    name: String
    age: Age
}

type Age {
    years: Int
    months: Int
}

type Baz {
    id: ID!
    name: Name
    age: Int
}

type Name {
    first: String
    last: String
}
```

If the operation is generated as following;
```graphql
query {
    foo {
        id
        name
        age {
            years
            months
        }
    }
}
```

It should be spreaded on the union type field correctly as following;
```graphql
query {
    foo {
        ... on Bar {
            id
            age {
                years
                months
            }
        }
        ... on Baz {
            id
            name {
                first
                last
            }
        }
    }
}
```
