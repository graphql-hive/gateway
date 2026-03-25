import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

describe('Entity Caching', async () => {
  const { service, gateway } = createTenv(__dirname);
  const products = await service('products');
  const reviews = await service('reviews');
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [products, reviews],
    },
  });

  it('fetches all products', async () => {
    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          products {
            id
            name
            price
            category
          }
        }
      `,
    });
    expect(result).toEqual({
      data: {
        products: [
          {
            id: '1',
            name: 'Wireless Headphones',
            price: 79.99,
            category: 'Electronics',
          },
          { id: '2', name: 'Coffee Maker', price: 49.99, category: 'Kitchen' },
          { id: '3', name: 'Running Shoes', price: 119.99, category: 'Sports' },
        ],
      },
    });
  });

  it('fetches a single product by id', async () => {
    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          product(id: "2") {
            id
            name
            price
            category
          }
        }
      `,
    });
    expect(result).toEqual({
      data: {
        product: {
          id: '2',
          name: 'Coffee Maker',
          price: 49.99,
          category: 'Kitchen',
        },
      },
    });
  });

  it('fetches all reviews', async () => {
    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          reviews {
            id
            author
            body
            rating
          }
        }
      `,
    });
    expect(result).toEqual({
      data: {
        reviews: [
          { id: '1', author: 'Alice', body: 'Great sound quality!', rating: 5 },
          { id: '2', author: 'Bob', body: 'Comfortable to wear.', rating: 4 },
          {
            id: '3',
            author: 'Carol',
            body: 'Makes perfect coffee.',
            rating: 5,
          },
          { id: '4', author: 'Dave', body: 'Very durable shoes.', rating: 4 },
        ],
      },
    });
  });

  it('fetches reviews with their product details', async () => {
    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          reviews {
            id
            author
            rating
            product {
              id
              name
              price
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
            author: 'Alice',
            rating: 5,
            product: { id: '1', name: 'Wireless Headphones', price: 79.99 },
          },
          {
            id: '2',
            author: 'Bob',
            rating: 4,
            product: { id: '1', name: 'Wireless Headphones', price: 79.99 },
          },
          {
            id: '3',
            author: 'Carol',
            rating: 5,
            product: { id: '2', name: 'Coffee Maker', price: 49.99 },
          },
          {
            id: '4',
            author: 'Dave',
            rating: 4,
            product: { id: '3', name: 'Running Shoes', price: 119.99 },
          },
        ],
      },
    });
  });

  it('fetches products with their reviews', async () => {
    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          products {
            id
            name
            reviews {
              id
              author
              rating
            }
          }
        }
      `,
    });
    expect(result).toEqual({
      data: {
        products: [
          {
            id: '1',
            name: 'Wireless Headphones',
            reviews: [
              { id: '1', author: 'Alice', rating: 5 },
              { id: '2', author: 'Bob', rating: 4 },
            ],
          },
          {
            id: '2',
            name: 'Coffee Maker',
            reviews: [{ id: '3', author: 'Carol', rating: 5 }],
          },
          {
            id: '3',
            name: 'Running Shoes',
            reviews: [{ id: '4', author: 'Dave', rating: 4 }],
          },
        ],
      },
    });
  });
});
