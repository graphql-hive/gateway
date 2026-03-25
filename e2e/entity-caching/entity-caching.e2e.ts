import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

it('caches Product type responses - second request is a cache hit', async () => {
  const products = await service('products');
  const reviews = await service('reviews');
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [products, reviews],
    },
  });

  const query = /* GraphQL */ `
    query {
      products {
        id
        name
        price
        category
      }
    }
  `;
  const first = await gw.execute({ query });
  expect(first).toMatchObject({
    data: { products: expect.any(Array) },
    extensions: {
      responseCache: { hit: false, didCache: true, ttl: 30_000 },
    },
  });
  const second = await gw.execute({ query });
  expect(second).toMatchObject({
    data: { products: expect.any(Array) },
    extensions: {
      responseCache: { hit: true },
    },
  });
});

it('caches Review.rating field responses - second request is a cache hit with field-level TTL', async () => {
  const products = await service('products');
  const reviews = await service('reviews');
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [products, reviews],
    },
  });

  const query = /* GraphQL */ `
    query {
      reviews {
        id
        rating
      }
    }
  `;
  const first = await gw.execute({ query });
  expect(first).toMatchObject({
    data: { reviews: expect.any(Array) },
    extensions: {
      responseCache: { hit: false, didCache: true, ttl: 60_000 },
    },
  });
  const second = await gw.execute({ query });
  expect(second).toMatchObject({
    data: { reviews: expect.any(Array) },
    extensions: {
      responseCache: { hit: true },
    },
  });
});
