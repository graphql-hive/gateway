import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

it('Retry & Timeout', async () => {
  const flakeyService = await service('flakey');
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [flakeyService],
    },
  });

  const res = await gw.execute({
    query: /* GraphQL */ `
      query {
        product(id: "1") {
          id
          name
        }
      }
    `,
  });

  expect(res).toEqual({
    data: {
      product: {
        id: '1',
        name: 'Product 1',
      },
    },
  });

  const logs = gw.getStd('both');
  // The first request will fail, and the gateway will retry 2 more times
  expect(logs).toContain(
    'Fetching with {"query":"{__typename product(id:\\"1\\"){id name}}"} for the 1 time',
  );
  expect(logs).toContain(
    'Fetching with {"query":"{__typename product(id:\\"1\\"){id name}}"} for the 2 time',
  );
  expect(logs).toContain(
    'Fetching with {"query":"{__typename product(id:\\"1\\"){id name}}"} for the 3 time',
  );
});
