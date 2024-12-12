import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

const apolloServer = new ApolloServer({
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

startStandaloneServer(apolloServer, {
  listen: { port: opts.getServicePort('greetings') },
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
