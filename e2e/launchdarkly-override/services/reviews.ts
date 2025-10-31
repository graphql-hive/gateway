import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const port = Opts(process.argv).getServicePort('reviews');

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Review @key(fields: "id") {
          id: ID!
          content: String
          product: Product
        }

        type Query {
          reviews: [Review]
        }

        type Product @key(fields: "id") {
          id: ID!
        }
      `),
      resolvers: {
        Query: {
          reviews() {
            return [
              { id: '1', content: 'Great product!', product: { id: '101' } },
              { id: '2', content: 'Not bad', product: { id: '102' } },
            ];
          },
        },
      },
    }),
  }),
).listen(port);
