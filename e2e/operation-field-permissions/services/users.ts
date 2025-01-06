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
).listen(opts.getServicePort('users'));
