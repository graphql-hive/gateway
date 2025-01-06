import { createServer } from 'http';
import { createSchema, createYoga } from 'graphql-yoga';

createServer(
  createYoga({
    maskedErrors: false,
    schema: createSchema<any>({
      typeDefs: /* GraphQL */ `
        type Query {
          allowed: String!
          disallowed: String!
        }
      `,
      resolvers: {
        Query: {
          allowed: () => 'cool',
          disallowed: () => 'very not cool',
        },
      },
    }),
  }),
).listen(4001);
