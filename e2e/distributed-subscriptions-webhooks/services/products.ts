import { createServer } from 'node:http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const mainGwUrl = process.env['MAIN_GW_URL'];
if (!mainGwUrl) {
  throw new Error('MAIN_GW_URL environment variable is not set');
}

const port = Opts(process.argv).getServicePort('products');

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
    plugins: [
      {
        async onRequest({ url, endResponse, fetchAPI: { fetch } }) {
          if (url.pathname === '/product-released') {
            const res = await fetch(
              // url and opts like specified in additionalTypeDefs in mesh.config.ts
              `${mainGwUrl}/webhooks/new_product`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  id: '60',
                }),
              },
            );
            if (!res.ok) {
              throw new Error(
                `Failed to call product release webhook ${res.statusText}`,
              );
            }
            endResponse(new Response());
          }
        },
      },
    ],
  }),
).listen(port, () => {
  console.log(`Products subgraph running on http://localhost:${port}/graphql`);
});
