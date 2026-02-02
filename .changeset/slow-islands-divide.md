---
'@graphql-tools/delegate': patch
---

Do not add required fields if they are already present in the original selection set.

For example in Federation;

If you have a subgraph schema like below;

```graphql
type Book @key(fields: "upc otherUpc shop { id }") {
    upc: ID!
    otherUpc: ID!
    shop: Shop!
}

type Shop @key(fields: "id") {
    id: ID!
    name: String!
    location: Location!
}
```

And when you send a mutation like below;

```graphql
mutation {
    buyBook(input: { bookUpc: "test" }) {
        book {
            upc
            otherUpc
            shop {
                id
                name
                location {
                    address1
                    city
                    state
                }
            }
        }
    }
}
```

Previously, the gateway would add the required key fields again to the selection set when resolving the type like below;

```diff
mutation {
    buyBook(input: { bookUpc: "test" }) {
        book {
            upc
            otherUpc
-           upc
-           otherUpc          
-           shop { id } # from the key fields
            shop {
                id
                name
                location {
                    address1
                    city
                    state
                }
            }
        }
    }
}
```