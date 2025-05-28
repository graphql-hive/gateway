import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { products } from './data';

const typeDefs = parse(/* GraphQL */ `
  type Query {
    hello: String!
  }
  type Product @key(fields: "id") {
    id: ID!
    vendor: Vendor!
  }
  type Vendor {
    shippingAverage(destination: String = "UK"): String!
  }
`);

const resolvers = {
  Query: {
    hello: () => 'world',
  },
  Product: {
    __resolveReference(product: { id: string }) {
      return products.find((p) => p.id === product.id);
    },
  },
};

const yoga = createYoga({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
});

const opts = Opts(process.argv);

createServer(yoga).listen(opts.getServicePort('vendors'));
