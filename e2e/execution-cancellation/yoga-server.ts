import { createServer } from 'node:http';
import {
  createSchema,
  createYoga,
  useExecutionCancellation,
} from 'graphql-yoga';

export const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      hello: String
    }
  `,
  resolvers: {
    Query: {
      hello: () => 'world',
    },
  },
});

// Create a Yoga instance with a GraphQL schema.
const yoga = createYoga({
  schema,
  plugins: [useExecutionCancellation()],
});

// Pass it into a server to hook into request handlers.
const server = createServer(yoga);

// Start the server and you're done!
server.listen(parseInt(process.env['PORT']!), () => {
  console.info('Server is running on http://localhost:4000/graphql');
});
