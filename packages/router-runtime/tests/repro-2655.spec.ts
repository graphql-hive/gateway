import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { QueryPlanner } from '@graphql-hive/router-query-planner';
import { expect, it, vi } from 'vitest';
import { unifiedGraphHandler } from '../src/index';

it('computes the cache key natively on every request even when the plan is cached', async () => {
  const computeCacheKey = vi.spyOn(QueryPlanner.prototype, 'computeCacheKey');
  const planAsync = vi.spyOn(QueryPlanner.prototype, 'planAsync');

  await using gw = createGatewayTester({
    unifiedGraphHandler,
    subgraphs: [
      {
        name: 'upstream',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
          `,
          resolvers: { Query: { hello: () => 'world' } },
        },
      },
    ],
  });

  for (let i = 0; i < 5; i++) {
    await expect(gw.execute({ query: '{ hello }' })).resolves.toMatchObject({
      data: { hello: 'world' },
    });
  }

  // plan is cached after the first request
  expect(planAsync).toHaveBeenCalledTimes(1);
  // but the native cache key is computed on every single request (the issue)
  expect(computeCacheKey).toHaveBeenCalledTimes(5);
});
