import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { assertSingleExecutionValue } from '@internal/testing';
import { GraphQLError } from 'graphql';
import { expect, it } from 'vitest';
import { unifiedGraphHandler } from '../src/index';

it('should have accurate error paths', async () => {
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
            },
          },
        },
      },
    ],
  });

  const result = await gw.execute({
    query: /* GraphQL */ `
      {
        product {
          id
        }
        users {
          id
          name
        }
      }
    `,
  });

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
