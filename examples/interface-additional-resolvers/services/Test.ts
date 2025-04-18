import { createServer } from 'node:http';
import { createSchema, createYoga } from 'graphql-yoga';

export const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      interface Node {
        id: ID!
      }

      type User implements Node {
        id: ID!
        name: String!
      }

      type Query {
        node(id: ID!): Node
        user(id: ID!): User
      }
    `,
    resolvers: {
      Node: {
        __resolveType: (obj: { __typename: string }) => obj.__typename,
      },
      Query: {
        node: () => ({ __typename: 'User', id: '1', name: 'Alice' }),
      },
    },
  }),
  maskedErrors: false,
});

createServer(yoga).listen(4001, () => {
  console.log(
    `🚀 Server ready at http://localhost:${4001}/graphql`,
  );
});
