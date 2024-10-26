import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

it('should consistently explain the query plan', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'apollo',
      services: [
        await service('accounts'),
        await service('inventory'),
        await service('products'),
        await service('reviews'),
      ],
    },
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        fragment User on User {
          id
          username
          name
        }

        fragment Review on Review {
          id
          body
        }

        fragment Product on Product {
          inStock
          name
          price
          shippingEstimate
          upc
          weight
        }

        query TestQuery {
          users {
            ...User
            reviews {
              ...Review
              product {
                ...Product
                reviews {
                  ...Review
                  author {
                    ...User
                    reviews {
                      ...Review
                      product {
                        ...Product
                      }
                    }
                  }
                }
              }
            }
          }
          topProducts {
            ...Product
            reviews {
              ...Review
              author {
                ...User
                reviews {
                  ...Review
                  product {
                    ...Product
                  }
                }
              }
            }
          }
        }
      `,
    }),
  ).resolves.toMatchSnapshot();
});
