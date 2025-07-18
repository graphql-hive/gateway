import { ApolloServer } from '@apollo/server';
import {
  ExpressContextFunctionArgument,
  expressMiddleware,
} from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { GraphQLResolverMap } from '@apollo/subgraph/dist/schema-helper';
import { Opts } from '@internal/testing';
import cors from 'cors';
import express from 'express';
import { parse } from 'graphql';

const app = express();

const resolvers: GraphQLResolverMap<ExpressContextFunctionArgument> = {
  Query: {
    headers: (_source, _args, context) => {
      return {
        authorization: context.req.headers.authorization,
        sessionCookieId: context.req.headers['session-cookie-id'],
      };
    },
  },
};

const server = new ApolloServer<ExpressContextFunctionArgument>({
  schema: buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        headers: Headers!
      }

      type Headers {
        authorization: String
        sessionCookieId: String
      }
    `),
    resolvers: resolvers as GraphQLResolverMap<unknown>,
  }),
});

async function main() {
  // Note you must call `start()` on the `ApolloServer`
  // instance before passing the instance to `expressMiddleware`
  await server.start();

  // Specify the path where we'd like to mount our server
  app.use(
    '/graphql',
    cors(),
    express.json(),
    // @ts-expect-error - Weird typing issue with `expressMiddleware`
    expressMiddleware(server, { context: (ctx) => ctx }),
  );

  const opts = Opts(process.argv);

  app.listen(opts.getServicePort('upstream'), () => {
    console.log(
      `🚀 Server ready at http://localhost:${opts.getServicePort('upstream')}/graphql`,
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
