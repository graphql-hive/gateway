import EventEmitter from 'events';
import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga, Repeater } from 'graphql-yoga';

const typeDefs = parse(/* GraphQL */ `
  type Query {
    hello: String!
  }
  type Subscription {
    userPostChanged: User!
  }
  type User {
    id: ID!
    name: String!
    posts: [Post!]!
  }
  type Post {
    id: ID!
  }
`);

const userPostChangedEmitter = new EventEmitter();

const resolvers = {
  Query: {
    hello: () => 'world',
  },
  Subscription: {
    userPostChanged: {
      subscribe: () =>
        new Repeater(async (push, stop) => {
          function emit() {
            push({
              userPostChanged: {
                id: '1',
                name: 'John Doe',
                posts: [
                  {
                    id: '1',
                  },
                ],
              },
            });
          }
          userPostChangedEmitter.on('userPostChanged', emit);
          await stop;
          userPostChangedEmitter.off('userPostChanged', emit);
        }),
    },
  },
};

const yoga = createYoga({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  plugins: [
    {
      onRequest({ request }) {
        if (request.url.endsWith('userPostChanged')) {
          userPostChangedEmitter.emit('userPostChanged');
        }
      },
    },
  ],
});

const opts = Opts(process.argv);

createServer(yoga).listen(opts.getServicePort('users'));
