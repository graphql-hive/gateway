import { createServer } from 'http';
import { createSchema, createYoga } from 'graphql-yoga';

createServer(
  createYoga({
    schema: createSchema<any>({
      typeDefs: /* GraphQL */ `
        type Query {
          foo: Foo
        }

        type Foo {
          id: ID!
        }
      `,
      resolvers: {
        Query: {
          foo() {
            return { id: '1' };
          },
        },
      },
    }),
  }),
).listen(4001);
