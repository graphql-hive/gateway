import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

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
  listen: { port: 4001 },
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
