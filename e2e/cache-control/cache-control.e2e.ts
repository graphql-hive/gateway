import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

it('caches direct Product type responses', async () => {
  const products = await service('products');
  const reviews = await service('reviews');
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [products, reviews],
    },
  });

  await gw.execute({
    query: /* GraphQL */ `
      query {
        product(id: "1") {
          name
          price
        }
      }
    `,
  });
  await gw.execute({
    query: /* GraphQL */ `
      query {
        product(id: "1") {
          name
          price
        }
      }
    `,
  });

  const std = products.getStd('both');
  expect(std.match(/resolving Query\.product/g)).toHaveLength(1);
});

it('caches nested Product type responses', async () => {
  const products = await service('products');
  const reviews = await service('reviews');
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [products, reviews],
    },
    env: {
      DEBUG: 1,
    },
  });

  await gw.execute({
    query: /* GraphQL */ `
      query {
        review(id: "1") {
          product {
            name
            price
          }
        }
      }
    `,
  });
  await gw.execute({
    query: /* GraphQL */ `
      query {
        review(id: "1") {
          product {
            name
            price
          }
        }
      }
    `,
  });

  const std = products.getStd('both');
  expect(std.match(/resolving __resolveReference/g)).toHaveLength(1);
});

it('caches Review.rating field responses', async () => {
  const products = await service('products');
  const reviews = await service('reviews');
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [products, reviews],
    },
  });

  await gw.execute({
    query: /* GraphQL */ `
      query {
        review(id: "1") {
          author
          rating
        }
      }
    `,
  });
  await gw.execute({
    query: /* GraphQL */ `
      query {
        review(id: "1") {
          author
          rating
        }
      }
    `,
  });

  const std = reviews.getStd('both');
  expect(std.match(/resolving Review\.rating/g)).toHaveLength(1);
});
