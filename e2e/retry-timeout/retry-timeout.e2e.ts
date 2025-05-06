import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

it('Retry & Timeout', async () => {
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('flakey')],
    },
  });

  await expect(
    gw.execute({
      query: /* GraphQL */ `
        query {
          product(id: "1") {
            id
            name
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "product": {
          "id": "1",
          "name": "Product 1",
        },
      },
    }
  `);

  const logs = gw.getStd('both');

  // 1st will time out
  // 2nd will with 429 too early retry
  // 3rd will fail with 504
  // 4th will succeed
  expect(logs.match(/\[FETCHING\]/g)?.length).toBe(4);
});
