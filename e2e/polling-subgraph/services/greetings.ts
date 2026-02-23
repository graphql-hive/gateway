import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);
const port = opts.getServicePort('greetings');

createServer(
  createYoga({
    maskedErrors: false,
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          greetings: String
        }
      `,
      resolvers: {
        Query: {
          greetings: () => 'Hello!',
        },
      },
    }),
  }),
).listen(port, () => {
  console.log(
    `Greetings service is running on http://localhost:${port}/graphql`,
  );
});
