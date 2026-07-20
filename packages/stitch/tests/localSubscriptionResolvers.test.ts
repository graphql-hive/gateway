import type { SubschemaConfig } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { assertAsyncIterable } from '@internal/testing';
import { parse, subscribe } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { stitchSchemas } from '../src/stitchSchemas.js';

function makeReviews() {
  const data = [
    { id: '1', content: 'Great vacuum!' },
    { id: '2', content: 'Does the job.' },
    { id: '3', content: 'Worth every penny.' },
  ];
  const schema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        reviewById(id: ID!): Review
      }
      type Review {
        id: ID!
        content: String
      }
    `,
    resolvers: {
      Query: {
        reviewById: (_, { id }) => data.find((review) => review.id === id),
      },
    },
  });
  return {
    schema,
    subschemas: [
      {
        schema,
        merge: {
          Review: {
            selectionSet: '{ id }',
            fieldName: 'reviewById',
            args: ({ id }) => ({ id }),
          },
        },
      },
    ] satisfies SubschemaConfig[],
  };
}

function makeProducts() {
  const data = [
    {
      id: '1',
      name: 'Roomba X',
      price: 100,
      review: { id: '1' },
    },
    {
      id: '2',
      name: 'Roomba Y',
      price: 200,
      review: { id: '2' },
    },
    {
      id: '3',
      name: 'Roomba Z',
      price: 300,
      review: { id: '3' },
    },
  ];
  const productPriceResolver = vi.fn(
    (parent: { price: number }) => parent.price,
  );
  const schema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        productById(id: ID!): Product
        productByName(name: String!): Product
      }
      type Product {
        id: ID!
        name: String!
        price: Float!
        review: Review
      }
      type Review {
        id: ID!
      }
    `,
    resolvers: {
      Query: {
        productById: (_, { id }) => data.find((product) => product.id === id),
        productByName: (_, { name }) =>
          data.find((product) => product.name === name),
      },
      Product: {
        price: productPriceResolver,
      },
    },
  });
  return {
    productPriceResolver,
    subschemas: [
      {
        schema,
        merge: {
          Product: {
            selectionSet: '{ id }',
            fieldName: 'productById',
            args: ({ id }) => ({ id }),
          },
        },
      },
      {
        schema,
        merge: {
          Product: {
            selectionSet: '{ name }',
            fieldName: 'productByName',
            args: ({ name }) => ({ name }),
          },
        },
      },
    ] satisfies SubschemaConfig[],
  };
}

function createSubscriptionSchema(
  subschemas: SubschemaConfig[],
  events: Record<string, unknown>[],
) {
  return stitchSchemas({
    subschemas,
    typeDefs: /* GraphQL */ `
      type Subscription {
        newProduct: Product!
      }
    `,
    resolvers: {
      Subscription: {
        newProduct: {
          async *subscribe() {
            for (const event of events) {
              yield { newProduct: event };
            }
          },
        },
      },
    },
  });
}

describe('local subscription resolvers returning merged types', () => {
  it('resolves fields from subschemas for subscription events', async () => {
    const products = makeProducts();
    const result = await subscribe({
      schema: createSubscriptionSchema(products.subschemas, [
        { id: '1' },
        { name: 'Roomba Z' },
      ]),
      document: parse(/* GraphQL */ `
        subscription {
          newProduct {
            name
            ...ProductPrice
          }
        }
        fragment ProductPrice on Product {
          price
        }
      `),
    });
    assertAsyncIterable(result);
    const iterator = result;
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        data: { newProduct: { name: 'Roomba X', price: 100 } },
      },
      done: false,
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        data: { newProduct: { name: 'Roomba Z', price: 300 } },
      },
      done: false,
    });
  });

  it('resolves nested entities from subschemas for subscription events', async () => {
    const products = makeProducts();
    const reviews = makeReviews();
    const result = await subscribe({
      schema: createSubscriptionSchema(
        [...products.subschemas, ...reviews.subschemas],
        [{ id: '1' }, { name: 'Roomba Z' }],
      ),
      document: parse(/* GraphQL */ `
        subscription {
          newProduct {
            name
            review {
              content
            }
          }
        }
      `),
    });
    assertAsyncIterable(result);
    const iterator = result;
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        data: {
          newProduct: {
            name: 'Roomba X',
            review: { content: 'Great vacuum!' },
          },
        },
      },
      done: false,
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        data: {
          newProduct: {
            name: 'Roomba Z',
            review: { content: 'Worth every penny.' },
          },
        },
      },
      done: false,
    });
  });

  it('delegates only fields missing from the subscription event', async () => {
    const products = makeProducts();
    const result = await subscribe({
      schema: createSubscriptionSchema(products.subschemas, [
        { id: '2', price: 999 },
      ]),
      document: parse(/* GraphQL */ `
        subscription {
          newProduct {
            name
            price
          }
        }
      `),
    });
    assertAsyncIterable(result);
    const iterator = result;
    await expect(iterator.next()).resolves.toMatchObject({
      value: {
        data: { newProduct: { name: 'Roomba Y', price: 999 } },
      },
      done: false,
    });
    expect(products.productPriceResolver).not.toHaveBeenCalled();
  });
});
