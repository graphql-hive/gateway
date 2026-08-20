import { createGatewayTester } from '@graphql-hive/gateway-testing';
import type { KeyValueCache } from '@graphql-mesh/types';
import { expect, it, vi } from 'vitest';
import { unifiedGraphHandler } from '../src/index';

function createMockCache(): KeyValueCache {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => store.delete(key)),
    getKeysByPrefix: vi.fn(async (prefix: string) =>
      [...store.keys()].filter((key) => key.startsWith(prefix)),
    ),
  };
}

const QUERY_PLAN_CACHE_KEY_PREFIX = "hive-gateway:query-plan:";

function getQueryPlanCacheSetCalls(cache: KeyValueCache) {
  return vi
    .mocked(cache.set)
    .mock.calls.filter(([key]) => key.startsWith(QUERY_PLAN_CACHE_KEY_PREFIX));
}

it('caches the computed query plan in the provided cache', async () => {
  const cache = createMockCache();
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    cache,
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

  await expect(gw.execute({ query: '{ hello }' })).resolves.toMatchObject({
    data: { hello: 'world' },
  });

  const setCalls = getQueryPlanCacheSetCalls(cache);
  expect(setCalls).toHaveLength(1);
  const [key, value, options] = setCalls[0]!;
  expect(key.startsWith(QUERY_PLAN_CACHE_KEY_PREFIX)).toBe(true);
  expect(value).toMatchObject({ kind: 'QueryPlan' });
  expect(options).toEqual({ ttl: 60 * 60 * 24 });
});

it('reuses a query plan cached by another gateway instance through the shared cache', async () => {
  const cache = createMockCache();
  const subgraphs = [
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
  ];

  // Two independent gateways, sharing only the cache -
  // simulates plan reuse across processes, which the in-memory plan cache
  // alone cannot provide.
  await using gwA = createGatewayTester({
    unifiedGraphHandler,
    cache,
    subgraphs,
  });
  await using gwB = createGatewayTester({
    unifiedGraphHandler,
    cache,
    subgraphs,
  });

  await expect(gwA.execute({ query: '{ hello }' })).resolves.toMatchObject({
    data: { hello: 'world' },
  });
  expect(getQueryPlanCacheSetCalls(cache)).toHaveLength(1);
  const [cachedKey] = getQueryPlanCacheSetCalls(cache)[0]!;

  await expect(gwB.execute({ query: '{ hello }' })).resolves.toMatchObject({
    data: { hello: 'world' },
  });

  // gwB found the plan gwA cached, so it never recomputed/re-cached it.
  expect(getQueryPlanCacheSetCalls(cache)).toHaveLength(1);
  expect(cache.get).toHaveBeenCalledWith(cachedKey);
});
