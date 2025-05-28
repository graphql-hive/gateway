import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { products } from './data';

const typeDefs = parse(/* GraphQL */ `
  type Query {
    latestProduct: Product
  }
  type Product @key(fields: "id") {
    id: ID!
    name: String!
    vendor: Vendor! @external
    shippingEstimate: String
      @requires(fields: "vendor { shippingAverage(destination: \\"UK\\") }")
  }
  type Vendor @external {
    shippingAverage(destination: String = "UK"): String!
  }
`);

const resolvers = {
  Query: {
    latestProduct: () => products[0],
  },
  Product: {
    shippingEstimate: () => '2 weeks',
  },
};

const yoga = createYoga({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
});

const opts = Opts(process.argv);

createServer(yoga).listen(opts.getServicePort('products'));
