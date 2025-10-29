import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);
describe('Progressive Override E2E', async () => {
  it('overrides products if the header exists', async () => {
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [
          await service('inventory'),
          await service('products'),
          await service('reviews'),
        ],
      },
      services: [
        await service('label'), // ensure label service is running
      ],
      pipeLogs: true,
    });
    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          reviews {
            id
            product {
              id
              name
              inStock
              count
            }
          }
        }
      `,
      headers: {
        'x-use-inventory-service': 'true',
      },
    });
    expect(result).toEqual({
      data: {
        reviews: [
          {
            id: '1',
            product: {
              id: '101',
              name: 'Product 101',
              inStock: true,
              count: 42,
            },
          },
          {
            id: '2',
            product: {
              id: '102',
              name: 'Product 102',
              inStock: true,
              count: 42,
            },
          },
        ],
      },
    });
  });
  it('does not override products if the header does not exist', async () => {
    const gw = await gateway({
      pipeLogs: 'gw.log',
      supergraph: {
        with: 'apollo',
        services: [
          await service('inventory'),
          await service('products'),
          await service('reviews'),
        ],
      },
      services: [
        await service('label', {
          pipeLogs: true,
        }), // ensure label service is running
      ],
    });
    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          reviews {
            id
            product {
              id
              name
              inStock
              count
            }
          }
        }
      `,
    });
    expect(result).toEqual({
      data: {
        reviews: [
          {
            id: '1',
            product: {
              id: '101',
              name: 'Product 101',
              inStock: false,
              count: 42,
            },
          },
          {
            id: '2',
            product: {
              id: '102',
              name: 'Product 102',
              inStock: false,
              count: 42,
            },
          },
        ],
      },
    });
  });
});
