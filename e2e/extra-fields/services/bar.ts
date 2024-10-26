import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

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
).listen(opts.getServicePort('bar'));
