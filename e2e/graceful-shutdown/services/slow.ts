import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga, Repeater } from 'graphql-yoga';

const opts = Opts(process.argv);

const SLOW_MS = 300;

createServer(
  createYoga({
    maskedErrors: false,
    schema: buildSubgraphSchema([
      {
        typeDefs: parse(/* GraphQL */ `
          type Query {
            slowHello: String!
          }
          type Subscription {
            emitsOnceAndStalls: String!
          }
        `),
        resolvers: {
          Query: {
            async slowHello() {
              await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
              return 'world';
            },
          },
          Subscription: {
            emitsOnceAndStalls: {
              subscribe: () =>
                new Repeater(async (push, stop) => {
                  push({ emitsOnceAndStalls: 'world' });
                  await stop;
                }),
            },
          },
        },
      },
    ]),
  }),
).listen(opts.getServicePort('slow'));
