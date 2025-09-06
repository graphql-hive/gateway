import { createServer } from 'node:http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const port = Opts(process.argv).getServicePort('products');

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.6"
            import: ["@key", "@composeDirective"]
          )
          @link(
            url: "https://the-guild.dev/mesh/v1.0"
            import: ["@pubsubOperation"]
          )
          @composeDirective(name: "@pubsubOperation")

        directive @pubsubOperation(
          pubsubTopic: String!
          filterBy: String
          result: String
        ) on FIELD_DEFINITION

        type Query {
          hello: String!
        }
        type Product @key(fields: "id") {
          id: ID!
          name: String!
          price: Float!
        }

        type Subscription {
          newProductSubgraph: Product!
            @pubsubOperation(pubsubTopic: "new_product")
        }
      `),
      resolvers: {
        Query: {
          hello: () => 'world',
        },
        Product: {
          __resolveReference: (ref) => ({
            id: ref.id,
            name: `Roomba X${ref.id}`,
            price: 100,
          }),
        },
      },
    }),
  }),
).listen(port, () => {
  console.log(`Products subgraph running on http://localhost:${port}/graphql`);
});
