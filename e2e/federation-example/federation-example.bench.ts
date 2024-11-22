import { ApolloGateway } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { afterAll, bench, describe, expect } from 'vitest';

const duration = 10_000;

describe('Gateway', async () => {
  const query = /* GraphQL */ `
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
  `;

  const { fs, service, composeWithApollo, gateway } = createTenv(__dirname);

  const PRODUCTS_SIZE = process.env['PRODUCTS_SIZE'] || 3;

  const supergraphFile = await composeWithApollo([
    await service('accounts', {
      env: {
        PRODUCTS_SIZE,
      },
    }),
    await service('inventory', {
      env: {
        PRODUCTS_SIZE,
      },
    }),
    await service('products', {
      env: {
        PRODUCTS_SIZE,
      },
    }),
    await service('reviews', {
      env: {
        PRODUCTS_SIZE,
      },
    }),
  ]);
  const supergraph = await fs.read(supergraphFile);
  const hiveGw = await gateway({
    supergraph,
    args: ['--jit'],
    env: {
      NODE_ENV: 'production',
      JIT: 'true',
    },
  });
  const apolloGw = new ApolloServer({
    gateway: new ApolloGateway({
      supergraphSdl: supergraph,
    }),
  });
  const { url: apolloGwUrl } = await startStandaloneServer(apolloGw, {
    listen: { port: 0 },
  });

  afterAll(() => apolloGw.stop());

  bench(
    'Apollo Gateway',
    async () => {
      const res = await fetch(`${apolloGwUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
        }),
      });
      const data = await res.json();
      expect(data).toEqual({
        data: expect.any(Object),
      });
    },
    {
      time: duration,
    },
  );

  bench(
    'Hive Gateway',
    async () => {
      const res = await hiveGw.execute({
        query,
      });
      expect(res).toEqual({
        data: expect.any(Object),
      });
    },
    {
      time: duration,
    },
  );
});
