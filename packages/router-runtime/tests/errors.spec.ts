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
            }
          `,
          resolvers: {
            Query: {
              product: () => {
                return { id: 1, price: 20.2 };
              },
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
