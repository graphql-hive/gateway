import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { useServer } from 'graphql-ws/use/ws';
import { createSchema, createYoga, Repeater } from 'graphql-yoga';
import { WebSocketServer } from 'ws';

const opts = Opts(process.argv);

const schema = createSchema<any>({
  typeDefs: /* GraphQL */ `
    type Query {
      hello: String!
    }
    type Subscription {
      emitsOnceAndStalls: String!
    }
  `,
  resolvers: {
    Query: {
      hello: () => 'world',
    },
    Subscription: {
      emitsOnceAndStalls: {
        subscribe: (_parent, _args, context) => {
          if (context.connectionParams?.userId !== 'john') {
            throw new Error('Unauthorized');
          }
          return new Repeater(async (push, stop) => {
            push({ emitsOnceAndStalls: '👋' });
            await stop;
          });
        },
      },
    },
  },
});

const yoga = createYoga({
  maskedErrors: false,
  schema,
});

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

httpServer.listen(opts.getServicePort('stream'));
