import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { assertSingleExecutionValue } from '@internal/testing';
import { GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';
import { unifiedGraphHandler } from '../src/index';

// https://github.com/graphql-hive/gateway/issues/2658

async function execute(query: string, useRouterRuntime: boolean) {
  await using gw = createGatewayTester({
    ...(useRouterRuntime ? { unifiedGraphHandler } : {}),
    subgraphs: [
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
        name: 'products',
        schema: {
          typeDefs: /* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key"]
              )
            type Product @key(fields: "id") {
              id: ID!
              name: String!
            }
          `,
          resolvers: {
            Product: {
              __resolveReference: ({ id }: { id: string }) => {
                if (id === 'failing') {
                  throw new GraphQLError('Product lookup failed');
                }
                return null;
              },
            },
          },
        },
      },
    ],
  });
  const result = await gw.execute({ query });
  assertSingleExecutionValue(result);
  return {
    data: result.data,
    errors: result.errors?.map((e) => ({ message: e.message, path: e.path })),
  };
}

describe.each([
  ['default handler', false],
  ['router-runtime', true],
])('%s', (_, useRouterRuntime) => {
  it.each([
    ['not found, no fragment', '{ missing { product { id name } } }'],
    [
      'not found, inline fragment',
      '{ missing { product { ... on Product { id name } } } }',
    ],
    [
      'not found, inline fragment + __typename',
      '{ missing { product { __typename ... on Product { id name } } } }',
    ],
    [
      'not found, named fragment',
      '{ missing { product { ...P } } } fragment P on Product { id name }',
    ],
  ])('%s', async (_, query) => {
    const res = await execute(query, useRouterRuntime);
    expect(res.data).toEqual({ missing: [{ product: null }] });
    expect(res.errors).toEqual([
      {
        message: 'Cannot return null for non-nullable field Product.name.',
        path: ['missing', 0, 'product', 'name'],
      },
    ]);
  });

  it('lookup error, inline fragment + __typename', async () => {
    const res = await execute(
      '{ failing { product { __typename ... on Product { id name } } } }',
      useRouterRuntime,
    );
    expect(res.data).toEqual({ failing: [{ product: null }] });
    expect(res.errors).toEqual([
      expect.objectContaining({
        message: 'Product lookup failed',
        path: expect.arrayContaining(['failing', 0, 'product']),
      }),
    ]);
  });
});
