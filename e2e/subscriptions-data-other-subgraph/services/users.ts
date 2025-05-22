import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { createDeferredPromise, Opts } from '@internal/testing';
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

const emitter = createDeferredPromise<() => Promise<unknown>>();

const resolvers = {
  Query: {
    hello: () => 'world',
  },
  Subscription: {
    userPostChanged: {
      subscribe: () =>
        new Repeater(async (push, stop) => {
          emitter.resolve(() =>
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
            }),
          );
          await stop;
        }),
    },
  },
};

const yoga = createYoga({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  plugins: [
    {
      async onRequest({ request }) {
        if (request.url.endsWith('userPostChanged')) {
          const emit = await emitter.promise;
          await emit();
        }
      },
    },
  ],
});

const opts = Opts(process.argv);

createServer(yoga).listen(opts.getServicePort('users'));
