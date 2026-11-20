import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { assertSingleExecutionValue } from '@internal/testing';
import { createDeferredPromise } from '@whatwg-node/promise-helpers';
import { expect, it } from 'vitest';
import { unifiedGraphHandler } from '../src/index';

it('starts a fetch once its dependencies are done without waiting for unrelated ones', async () => {
  const events: string[] = [];
  const accountsCalled = createDeferredPromise<void>();
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    subgraphs: [
      {
        name: 'products',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              topProducts: [Product]
            }
            type Product @key(fields: "upc") {
              upc: String!
            }
          `,
          resolvers: {
            Query: {
              topProducts: () => [{ upc: '1' }],
            },
          },
        },
      },
      {
        name: 'inventory',
        schema: {
          typeDefs: /* GraphQL */ `
            type Product @key(fields: "upc") {
              upc: String!
              inStock: Boolean
            }
          `,
          resolvers: {
            Product: {
              __resolveReference: async (product: { upc: string }) => {
                // slow until accounts is asked, which never happens when accounts waits for us
                await Promise.race([
                  accountsCalled.promise,
                  new Promise((resolve) => setTimeout(resolve, 1_000)),
                ]);
                events.push('inventory done');
                return { ...product, inStock: true };
              },
            },
          },
        },
      },
      {
        name: 'reviews',
        schema: {
          typeDefs: /* GraphQL */ `
            type Product @key(fields: "upc") {
              upc: String!
              reviews: [Review]
            }
            type Review {
              author: User
            }
            type User @key(fields: "id") {
              id: ID!
            }
          `,
          resolvers: {
            Product: {
              __resolveReference: (product: { upc: string }) => ({
                ...product,
                reviews: [{ author: { id: 'u1' } }],
              }),
            },
          },
        },
      },
      {
        name: 'accounts',
        schema: {
          typeDefs: /* GraphQL */ `
            type User @key(fields: "id") {
              id: ID!
              name: String
            }
          `,
          resolvers: {
            User: {
              __resolveReference: (user: { id: string }) => {
                events.push('accounts');
                accountsCalled.resolve();
                return { ...user, name: 'Ada' };
              },
            },
          },
        },
      },
    ],
  });

  const result = await gw.execute({
    query: /* GraphQL */ `
      {
        topProducts {
          upc
          inStock
          reviews {
            author {
              name
            }
          }
        }
      }
    `,
  });

  assertSingleExecutionValue(result);
  expect(result).toEqual({
    data: {
      topProducts: [
        { upc: '1', inStock: true, reviews: [{ author: { name: 'Ada' } }] },
      ],
    },
  });
  // accounts only needs reviews, it must not wait for the slow inventory
  expect(events).toEqual(['accounts', 'inventory done']);
});
