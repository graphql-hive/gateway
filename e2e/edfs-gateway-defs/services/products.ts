import { createServer } from 'node:http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { createPubSub } from '../pubsub';

const port = Opts(process.argv).getServicePort('products');

async function main() {
  const pubsub = await createPubSub();

  createServer(
    createYoga({
      schema: buildSubgraphSchema({
        typeDefs: parse(/* GraphQL */ `
          type Query {
            hello: String!
          }
          type Product @key(fields: "id") {
            id: ID!
            name: String!
            price: Float!
          }

          type Mutation {
            createProduct(name: String!, price: Float!): Product!
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
          Mutation: {
            createProduct: (_parent, { name, price }) => {
              const product = {
                id: String(Math.floor(Math.random() * 1000)),
                name,
                price,
              };

              pubsub.publish('new_product', product);

              return product;
            },
          },
        },
      }),
    }),
  ).listen(port, () => {
    console.log(
      `Products subgraph running on http://localhost:${port}/graphql`,
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
