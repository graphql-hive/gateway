---
'@graphql-tools/stitch': patch
---

Normalize the subschemas with root types in a custom names like `query_root` instead of `Query`, then stitch them

```graphql
schema {
    query: query_root
    subscription: subscription_root
}

type Post {
    id: ID!
    text: String
    userId: ID!
}

type query_root {
    postById(id: ID!): Post
}

type subscription_root {
    postsByUserId(userId: ID!): [Post]!
}
```

and
```graphql
type User {
    id: ID!
    email: String
}

type Query {
    userById(id: ID!): User
}
```

should be stitched as;

```graphql
type Query {
  postById(id: ID!): Post
  userById(id: ID!): User
}

type Subscription {
  postsByUserId(userId: ID!): [Post]!
}

type Post {
  id: ID!
  text: String
  userId: ID!
}

type User {
  id: ID!
  email: String
}
```