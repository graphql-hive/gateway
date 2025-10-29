import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const port = 4001;

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Product @key(fields: "id") {
          id: ID!
          inStock: Boolean
            @override(from: "products", label: "use_inventory_service")
          count: Int
        }

        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.7"
            import: ["@key", "@override"]
          )
      `),
      resolvers: {
        Product: {
          __resolveReference(reference: { id: string }) {
            return {
              id: reference.id,
            };
          },
          inStock: () => true,
          count: () => 42,
        },
      },
    }),
  }),
).listen(port);
