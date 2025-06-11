import { createExampleSetup, createTenv } from '@internal/e2e';
import { toGlobalId } from 'graphql-relay';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph, query, result } = createExampleSetup(__dirname);

it('should execute as usual', async () => {
  const { execute } = await gateway({
    supergraph: await supergraph(),
  });
  await expect(
    execute({
      query,
    }),
  ).resolves.toEqual(result);
});

it('should find objects through node', async () => {
  const { execute } = await gateway({
    supergraph: await supergraph(),
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        query ($nodeId: ID!) {
          node(nodeId: $nodeId) {
            ... on Product {
              nodeId
              upc
              name
              price
              weight
            }
          }
        }
      `,
      variables: {
        nodeId: toGlobalId('Product', '2'),
      },
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "node": {
          "name": "Couch",
          "nodeId": "UHJvZHVjdDoy",
          "price": 1299,
          "upc": "2",
          "weight": 1000,
        },
      },
    }
  `);
});
