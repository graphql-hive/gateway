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
          a: String!
        }
      `,
      resolvers: {
        Query: {
          a: () => 'hello from a',
        },
      },
    }),
  }),
).listen(opts.getServicePort('a'));
