import { createServer } from 'node:http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const port = Opts(process.argv).getServicePort('inventory');

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          hello: String!
        }
        type Product @key(fields: "id") {
          id: ID! @external
          price: Float! @external
          shippingEstimate: Int @requires(fields: "price")
        }
      `),
      resolvers: {
        Query: {
          hello: () => 'world',
        },
        Product: {
          __resolveReference: (ref) => ({
            ...ref,
            shippingEstimate: Math.floor(ref.price / 10),
          }),
        },
      },
    }),
  }),
).listen(port, () => {
  console.log(`Inventory subgraph running on http://localhost:${port}/graphql`);
});
