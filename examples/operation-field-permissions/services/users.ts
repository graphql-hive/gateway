import { createServer } from 'http';
import { createSchema, createYoga } from 'graphql-yoga';

createServer(
  createYoga({
    maskedErrors: false,
    schema: createSchema<any>({
      typeDefs: /* GraphQL */ `
        type Query {
          registrationOpen: Boolean!
          me: User!
        }
        type User {
          name: String!
        }
      `,
      resolvers: {
        Query: {
          registrationOpen: () => false,
          me: () => ({ name: 'John' }),
        },
      },
    }),
  }),
).listen(4001);
