import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

createServer(
  createYoga({
    maskedErrors: false,
    schema: createSchema<any>({
      typeDefs: /* GraphQL */ `
        type Query {
          b: String!
        }
      `,
      resolvers: {
        Query: {
          b: () => 'hello from b',
        },
      },
    }),
  }),
).listen(opts.getServicePort('b'));
