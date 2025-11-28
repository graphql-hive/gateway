import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { expect, it, vi } from 'vitest';
import { unifiedGraphHandler, useQueryPlan } from '../src/index';

it('should callback when the query plan is available', async () => {
  const onQueryPlanFn = vi.fn();
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    plugins: () => [
      useQueryPlan({
        onQueryPlan: onQueryPlanFn,
      }),
    ],
    subgraphs: [
      {
        name: 'upstream',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'world',
            },
          },
        },
      },
    ],
  });

  await gw.execute({
    query: /* GraphQL */ `
      {
        hello
      }
    `,
  });

  expect(onQueryPlanFn).toBeCalledWith({
    kind: 'QueryPlan',
    node: {
      kind: 'Fetch',
      operation: '{hello}',
      operationKind: 'query',
      serviceName: 'upstream',
    },
  });
});

it('should include the query plan in result extensions when exposed', async () => {
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    plugins: () => [
      useQueryPlan({
        expose: true,
      }),
    ],
    subgraphs: [
      {
        name: 'upstream',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'world',
            },
          },
        },
      },
    ],
  });

  await expect(
    gw.execute({
      query: /* GraphQL */ `
        {
          hello
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "hello": "world",
      },
      "extensions": {
        "queryPlan": {
          "kind": "QueryPlan",
          "node": {
            "kind": "Fetch",
            "operation": "{hello}",
            "operationKind": "query",
            "serviceName": "upstream",
          },
        },
      },
    }
  `);
});

it('should include the query plan in result extensions when expose returns true', async () => {
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    plugins: () => [
      useQueryPlan({
        expose: (req) => req.headers.get('x-expose-query-plan') === 'true',
      }),
    ],
    subgraphs: [
      {
        name: 'upstream',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'world',
            },
          },
        },
      },
    ],
  });

  await expect(
    gw.execute({
      query: /* GraphQL */ `
        {
          hello
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "hello": "world",
      },
    }
  `);

  await expect(
    gw.execute({
      headers: {
        'x-expose-query-plan': 'true',
      },
      query: /* GraphQL */ `
        {
          hello
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "hello": "world",
      },
      "extensions": {
        "queryPlan": {
          "kind": "QueryPlan",
          "node": {
            "kind": "Fetch",
            "operation": "{hello}",
            "operationKind": "query",
            "serviceName": "upstream",
          },
        },
      },
    }
  `);
});
