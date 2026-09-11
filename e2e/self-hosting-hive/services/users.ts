import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { createDeferredPromise, Opts } from '@internal/testing';
import { parse } from 'graphql';
import { useServer } from 'graphql-ws/use/ws';
import { createYoga, Repeater } from 'graphql-yoga';
import { WebSocketServer } from 'ws';

const typeDefs = parse(/* GraphQL */ `
  type Query {
    hello: String!
  }
  type Subscription {
    userPostChanged: User!
    sameUser5Times: User!
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
    sameUser5Times: {
      subscribe: () =>
        new Repeater(async (push, stop) => {
          for (let i = 1; i <= 5; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            push({
              sameUser5Times: {
                id: '2',
                name: 'Jane Doe',
                posts: [
                  {
                    id: '1',
                  },
                ],
              },
            });
          }
          stop();
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

const httpServer = createServer(yoga);

const wsServer = new WebSocketServer({
  server: httpServer,
  path: yoga.graphqlEndpoint,
});

useServer(
  {
    execute: (args: any) => args.rootValue.execute(args),
    subscribe: (args: any) => args.rootValue.subscribe(args),
    onSubscribe: async (ctx, _id, params) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } =
        yoga.getEnveloped({
          ...ctx,
          req: ctx.extra.request,
          socket: ctx.extra.socket,
          params,
        });

      const args = {
        schema,
        operationName: params.operationName,
        document: parse(params.query),
        variableValues: params.variables,
        contextValue: await contextFactory(),
        rootValue: {
          execute,
          subscribe,
        },
      };

      const errors = validate(args.schema, args.document);
      if (errors.length) return errors;
      return args;
    },
  },
  wsServer,
);

httpServer.listen(opts.getServicePort('users'));
