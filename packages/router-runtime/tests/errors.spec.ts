import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { assertSingleExecutionValue } from '@internal/testing';
import { GraphQLError } from 'graphql';
import { expect, it } from 'vitest';
import { unifiedGraphHandler } from '../src/index';

async function execute(query: string) {
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    subgraphs: [
      {
        name: 'products',
        schema: {
          typeDefs: /* GraphQL */ `
            extend type Query {
              product: Product
            }

            type Product @key(fields: "id") {
              id: ID!
              price: Int
              name: String!
            }
          `,
          resolvers: {
            Query: {
              product: () => {
                return { id: 1, price: 20.2, name: 'Product' };
              },
            },
            Product: {
              __resolveReference: ({ id }: { id: string }) => {
                if (id === 'failing') {
                  throw new GraphQLError('Product lookup failed');
                }
                // unknown product
                return null;
              },
            },
          },
        },
      },
      {
        name: 'items',
        schema: {
          typeDefs: /* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key"]
              )
            type Query {
              missing: [Item!]!
              failing: [Item!]!
            }
            type Item {
              id: ID!
              product: Product
            }
            type Product @key(fields: "id", resolvable: false) {
              id: ID!
            }
          `,
          resolvers: {
            Query: {
              missing: () => [{ id: '1', product: { id: 'missing' } }],
              failing: () => [{ id: '2', product: { id: 'failing' } }],
            },
          },
        },
      },
      {
        name: 'users',
        schema: {
          typeDefs: /* GraphQL */ `
            extend type Query {
              users: [User]
            }
            type User {
              id: ID!
              name: String
              friends: [User]
            }
          `,
          resolvers: {
            Query: {
              users: () => [{ id: 2 }],
            },
            User: {
              name: () => {
                throw new GraphQLError('Something went wrong', {
                  extensions: {
                    code: 'OOPSIE',
                  },
                });
              },
              friends: () => [{ id: 3 }],
            },
          },
        },
      },
    ],
  });

  return await gw.execute({ query });
}

it('should have accurate error paths', async () => {
  const result = await execute(/* GraphQL */ `
    {
      product {
        id
      }
      users {
        id
        name
      }
    }
  `);

  assertSingleExecutionValue(result);

  const data = result.data;
  const formattedErrors = result.errors?.map((e) => e.toJSON());

  expect(data).toMatchInlineSnapshot(`
    {
      "product": {
        "id": "1",
      },
      "users": [
        {
          "id": "2",
          "name": null,
        },
      ],
    }
  `);
  expect(formattedErrors).toMatchInlineSnapshot(`
    [
      {
        "extensions": {
          "code": "OOPSIE",
          "serviceName": "users",
        },
        "message": "Something went wrong",
        "path": [
          "users",
          0,
          "name",
        ],
      },
    ]
  `);
});

it.each([
  {
    name: 'aliases',
    query: /* GraphQL */ `
      {
        people: users {
          displayName: name
        }
      }
    `,
    path: ['people', 0, 'displayName'],
  },
  {
    name: 'nested lists',
    query: /* GraphQL */ `
      {
        users {
          friends {
            name
          }
        }
      }
    `,
    path: ['users', 0, 'friends', 0, 'name'],
  },
])(
  'preserves graphql-js error paths through $name',
  async ({ query, path }) => {
    const result = await execute(query);

    assertSingleExecutionValue(result);
    expect(result.errors?.map((error) => error.path)).toEqual([path]);
  },
);

it.each([
  {
    name: 'no fragment',
    query: /* GraphQL */ `
      {
        missing {
          product {
            id
            name
          }
        }
      }
    `,
  },
  {
    name: 'inline fragment',
    query: /* GraphQL */ `
      {
        missing {
          product {
            ... on Product {
              id
              name
            }
          }
        }
      }
    `,
  },
  {
    name: 'inline fragment and __typename',
    query: /* GraphQL */ `
      {
        missing {
          product {
            __typename
            ... on Product {
              id
              name
            }
          }
        }
      }
    `,
  },
  {
    name: 'named fragment',
    query: /* GraphQL */ `
      {
        missing {
          product {
            ...P
          }
        }
      }
      fragment P on Product {
        id
        name
      }
    `,
  },
])(
  'nulls an unresolved entity with missing non-nullable fields through $name',
  async ({ query }) => {
    const result = await execute(query);

    assertSingleExecutionValue(result);
    expect(result.data).toEqual({ missing: [{ product: null }] });
    expect(
      result.errors?.map(({ message, path }) => ({ message, path })),
    ).toEqual([
      {
        message: 'Cannot return null for non-nullable field Product.name.',
        path: ['missing', 0, 'product', 'name'],
      },
    ]);
  },
);

it('nulls an entity whose lookup failed and keeps the list index in the error path', async () => {
  const result = await execute(/* GraphQL */ `
    {
      failing {
        product {
          __typename
          ... on Product {
            id
            name
          }
        }
      }
    }
  `);

  assertSingleExecutionValue(result);
  expect(result.data).toEqual({ failing: [{ product: null }] });
  expect(
    result.errors?.map(({ message, path }) => ({ message, path })),
  ).toEqual([
    {
      message: 'Product lookup failed',
      path: ['failing', 0, 'product'],
    },
  ]);
});
