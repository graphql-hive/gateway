import { createServer } from 'http';
import { createSchema, createYoga } from 'graphql-yoga';

createServer(
  createYoga({
    schema: createSchema<any>({
      typeDefs: /* GraphQL */ `
        type Query {
          bar: Bar
        }

        type Bar {
          id: ID!
        }
      `,
      resolvers: {
        Query: {
          bar() {
            return { id: '1' };
          },
        },
      },
    }),
  }),
).listen(4002);
