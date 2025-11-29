import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { QueryPlan } from '@graphql-hive/router-query-planner';
import { expect, it } from 'vitest';
import { unifiedGraphHandler, useQueryPlan } from '../src/index';

it('should callback when the query plan is available', async () => {
  let queryPlan!: QueryPlan;
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    plugins: () => [
      useQueryPlan({
        onQueryPlan(_queryPlan) {
          queryPlan = _queryPlan;
        },
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

  expect(queryPlan).toMatchInlineSnapshot(`
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "operation": "{hello}",
        "operationKind": "query",
        "serviceName": "upstream",
      },
    }
  `);
});

it('should include the query plan in result extensions when exposed', async () => {
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    plugins: () => [
      useQueryPlan({
        exposeInResultExtensions: true,
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
        exposeInResultExtensions: (req) => req.headers.get('x-expose-query-plan') === 'true',
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
