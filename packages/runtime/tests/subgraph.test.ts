import { buildSubgraphSchema } from '@apollo/subgraph';
import { createDefaultExecutor } from '@graphql-tools/delegate';
import { parse } from 'graphql';
import { expect, it } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';

it('should delegate requests to the subgraph supporting aliases', async () => {
  const subgraph = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        products: [Product]
      }
      type Product {
        title: String
      }
    `),
    resolvers: {
      Query: {
        products: () => [{ title: 'glasses' }, { title: 'shoes' }],
      },
    },
  });

  await using gw = createGatewayRuntime({
    subgraph,
    maskedErrors: false,
    transports: () => ({
      getSubgraphExecutor: () => createDefaultExecutor(subgraph),
    }),
  });

  const res = await gw.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: /* GraphQL */ `
        {
          products {
            productTitle: title
          }
        }
      `,
    }),
  });

  await expect(res.json()).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "products": [
          {
            "productTitle": "glasses",
          },
          {
            "productTitle": "shoes",
          },
        ],
      },
    }
  `);
});
