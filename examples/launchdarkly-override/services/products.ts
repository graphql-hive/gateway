import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const port = 4002;

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Product @key(fields: "id") {
          id: ID!
          name: String
          price: Float
          inStock: Boolean
        }

        type Query {
          product(id: ID!): Product
        }
      `),
      resolvers: {
        Product: {
          __resolveReference(reference: { id: string }) {
            return {
              id: reference.id,
            };
          },
          name: (parent: { id: string }) => `Product ${parent.id}`,
          price: () => 9.99,
          inStock: () => false,
        },
        Query: {
          product(_: any, args: { id: string }) {
            return { id: args.id };
          },
        },
      },
    }),
  }),
).listen(port);
