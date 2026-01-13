import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

const schema = createSchema({
  typeDefs: `
    type Query {
      hello: String!
    }
    type Subscription {
      messageAdded: String!
      countdown(from: Int!): Int!
    }
  `,
  resolvers: {
    Query: {
      hello: () => 'Hello from programmatic WebSocket example!',
    },
    Subscription: {
      messageAdded: {
        subscribe: async function* () {
          yield { messageAdded: 'Message 1' };
        },
      },
      countdown: {
        subscribe: async function* (_, { from }) {
          for (let i = from; i >= 0; i--) {
            yield { countdown: i };
            await new Promise(resolve => setTimeout(resolve, 10)); // Small delay for test
          }
        },
      },
    },
  },
});

const yoga = createYoga({
  schema,
  graphqlEndpoint: '/graphql',
});

const server = createServer(yoga);
server.listen(opts.getServicePort('api'));