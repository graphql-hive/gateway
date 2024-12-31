---
'@graphql-tools/batch-delegate': patch
---

Memoize the key arguments correctly;

With the following schema and resolvers, `userById` should batch all the requests to `usersByIds`;

```ts
{
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          email: String!
        }
        type Query {
          userById(id: ID!): User
          usersByIds(ids: [ID!]): [User]
        }
      `,
      resolvers: {
        Query: {
          usersByIds: (_root, args) => {
            return args.ids.map((id: string) => users.find((user) => user.id === id));
          },
          userById: (root, args, context, info) => {
            return batchDelegateToSchema({
              schema: userSubschema,
              fieldName: 'usersByIds',
              key: args.id,
              rootValue: root,
              context,
              info,
            })
          },
        },
      },
    }
```

This query should batch all the requests to `usersByIds`:

```graphql
{
  userById(id: "1") {
    id
    email
  }
  userById(id: "2") {
    id
    email
  }
}
```

The delegation request should be;

```graphql
{
  usersByIds(ids: ["1", "2"]) {
    id
    email
  }
}
```