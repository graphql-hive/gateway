import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

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
              await new Promise((resolve) => setTimeout(resolve, 3000));
              return 'world';
            },
          },
        },
      },
    ]),
  }),
).listen(opts.getServicePort('hello'));
