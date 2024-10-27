import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

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
).listen(opts.getServicePort('foo'));
