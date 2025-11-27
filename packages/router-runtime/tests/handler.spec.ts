import { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { expect, it } from 'vitest';
import { unifiedGraphHandler } from '../src/handler';

it('should include the query plan in result extensions when context', async () => {
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    plugins: () => [
      {
        onContextBuilding({ context, extendContext }) {
          if (context.headers['hive-expose-query-plan'] === 'true') {
            extendContext({
              queryPlanInExtensions: true,
            });
          }
        },
      } satisfies GatewayPlugin,
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
      query: /* GraphQL */ `
        {
          hello
        }
      `,
      headers: {
        'hive-expose-query-plan': 'true',
      },
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
