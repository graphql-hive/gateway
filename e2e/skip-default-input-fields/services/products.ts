import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';

const port = Opts(process.argv).getServicePort('products');

createServer(
  createYoga({
    schema: createSchema({
      typeDefs: parse(/* GraphQL */ `
        type Product {
          name: String
          price: Float
        }

        input GetProductInput {
          name: String = ""
        }

        type Query {
          getProduct(input: GetProductInput!): Product
        }
      `),
      resolvers: {
        Product: {
          price: () => 67,
        },
        Query: {
          getProduct(_: any, args) {
            console.log({ args });
            return { ...args };
          },
        },
      },
    }),
  }),
).listen(port);
