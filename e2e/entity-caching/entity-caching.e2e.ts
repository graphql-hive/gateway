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
        reviews {
          id
          author
          body
          rating
        }
      }
    }
  `;
  const first = await gw.execute({ query });
  expect(first).toMatchObject({
    data: { products: expect.any(Array) },
  });
  const second = await gw.execute({ query });
  expect(second).toMatchObject({
    data: { products: expect.any(Array) },
  });

  // resolver was only invoked once - the second request was served from cache
  const std = products.getStd('both');
  expect(std.match(/resolving products/g)).toHaveLength(1);
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
        author
        body
        rating
        product {
          id
          name
          price
          category
        }
      }
    }
  `;
  const first = await gw.execute({ query });
  expect(first).toMatchObject({
    data: { reviews: expect.any(Array) },
  });
  const second = await gw.execute({ query });
  expect(second).toMatchObject({
    data: { reviews: expect.any(Array) },
  });

  // resolver was only invoked once - the second request was served from cache
  const std = reviews.getStd('both');
  expect(std.match(/resolving reviews/g)).toHaveLength(1);
});
