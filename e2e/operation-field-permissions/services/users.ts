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
).listen(opts.getServicePort('users'));
