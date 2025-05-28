import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should pull related data from other subgraph after emit', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('vendors'), await service('products')],
    },
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        {
          latestProduct {
            shippingEstimate
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "latestProduct": {
          "shippingEstimate": "2 weeks",
        },
      },
    }
  `);
});
