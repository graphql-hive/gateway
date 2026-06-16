import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

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
        `),
        resolvers: {
          Query: {
            async slowHello() {
              await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
              return 'world';
            },
          },
        },
      },
    ]),
  }),
).listen(opts.getServicePort('slow'));
