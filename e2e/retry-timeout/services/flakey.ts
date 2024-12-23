import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { GraphQLResolverMap } from '@apollo/subgraph/dist/schema-helper';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import {
  createGraphQLError,
  createYoga,
  YogaInitialContext,
} from 'graphql-yoga';

const opts = Opts(process.argv);

let i = 0;
let lastAttempt: number | undefined;

const servicePort = opts.getServicePort('flakey');

const resolvers = {
  Query: {
    product: (
      _: unknown,
      { id }: { id: string },
      context: YogaInitialContext,
    ) => {
      i++;
      console.log(`${i} attempt`);
      if (lastAttempt && Date.now() - lastAttempt < 1000) {
        const secondsToWait = Math.ceil(
          (1000 - (Date.now() - lastAttempt)) / 1000,
        );
        return createGraphQLError('You are too early, still wait...', {
          extensions: {
            http: {
              status: 429,
              headers: {
                'retry-after': secondsToWait.toString(),
              },
            },
          },
        });
      }
      lastAttempt = Date.now();
      // First attempt will fail with timeout
      if (i === 1) {
        let reject: (reason: any) => void;
        const promise = new Promise<void>((_resolve, _reject) => {
          reject = _reject;
        });
        setTimeout(() => {
          reject('Timeout');
        }, 1000);
        return promise;
      }
      // Second attempt will fail with 500
      if (i === 2) {
        return createGraphQLError('Flakiness...', {
          extensions: {
            http: {
              status: 503,
              headers: {
                'retry-after': '1',
              },
            },
          },
        });
      }
      // Third attempt will return
      return {
        id,
        name: 'Product ' + id,
      };
    },
  },
} as GraphQLResolverMap<unknown>;

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          product(id: ID!): Product
        }

        type Product {
          id: ID!
          name: String!
        }
      `),
      resolvers,
    }),
  }),
).listen(servicePort, () => {
  console.log(
    `🚀 Flakey service ready at http://localhost:${servicePort}/graphql`,
  );
});
