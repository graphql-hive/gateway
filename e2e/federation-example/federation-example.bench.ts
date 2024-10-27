import { createTenv, Gateway } from '@internal/e2e';
import { beforeAll, bench, expect } from 'vitest';

const { fs, gateway, service, composeWithApollo } = createTenv(__dirname);

let gw: Gateway;
beforeAll(async () => {
  const supergraph = await composeWithApollo([
    await service('accounts'),
    await service('inventory'),
    await service('products'),
    await service('reviews'),
  ]);
  const supergraphFile = await fs.tempfile('supergraph.graphql');
  await fs.write(supergraphFile, supergraph);
  gw = await gateway({ supergraph: supergraphFile });
});

bench('TestQuery', async () => {
  await expect(
    gw.execute({
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
            __typename
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
  ).resolves.toEqual({
    data: expect.objectContaining({
      users: expect.arrayContaining([
        expect.objectContaining({
          __typename: expect.stringContaining(''),
        }),
      ]),
    }),
  });
});
