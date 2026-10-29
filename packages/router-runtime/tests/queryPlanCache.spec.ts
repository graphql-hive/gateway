import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { QueryPlanner } from '@graphql-hive/router-query-planner';
import type { KeyValueCache } from '@graphql-mesh/types';
import { afterEach, expect, it, vi } from 'vitest';
import { unifiedGraphHandler } from '../src/index';

function createMockCache() {
  const store = new Map<string, unknown>();
  const get = vi.fn(async (key: string) => store.get(key));
  const set = vi.fn(async (key: string, value: unknown, _options?: unknown) => {
    store.set(key, value);
  });
  const cache = {
    get,
    set,
    delete: vi.fn(async (key: string) => store.delete(key)),
    getKeysByPrefix: vi.fn(async (prefix: string) =>
      [...store.keys()].filter((key) => key.startsWith(prefix)),
    ),
  } satisfies KeyValueCache;
  return { cache, get, set };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const QUERY_PLAN_CACHE_KEY_PREFIX = 'hive-gateway:query-plan:';

function getQueryPlanCacheSetCalls(
  set: ReturnType<typeof createMockCache>['set'],
) {
  return set.mock.calls.filter(([key]) =>
    key.startsWith(QUERY_PLAN_CACHE_KEY_PREFIX),
  );
}

it('caches the computed query plan in the provided cache', async () => {
  const { cache, set } = createMockCache();
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

  const setCalls = getQueryPlanCacheSetCalls(set);
  expect(setCalls).toHaveLength(1);
  const [key, value, options] = setCalls[0]!;
  expect(key.startsWith(QUERY_PLAN_CACHE_KEY_PREFIX)).toBe(true);
  expect(value).toMatchObject({ kind: 'QueryPlan' });
  expect(options).toEqual({ ttl: 60 * 60 * 24 });
});

it('reuses a query plan cached by another gateway instance through the shared cache', async () => {
  const { cache, get, set } = createMockCache();
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
  expect(getQueryPlanCacheSetCalls(set)).toHaveLength(1);
  const [cachedKey] = getQueryPlanCacheSetCalls(set)[0]!;

  await expect(gwB.execute({ query: '{ hello }' })).resolves.toMatchObject({
    data: { hello: 'world' },
  });

  // gwB found the plan gwA cached, so it never recomputed/re-cached it.
  expect(getQueryPlanCacheSetCalls(set)).toHaveLength(1);
  expect(get).toHaveBeenCalledWith(cachedKey);
});

it('reuses the in-memory query plan for the same document', async () => {
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
          resolvers: {
            Query: {
              hello: () => 'world',
            },
          },
        },
      },
    ],
  });

  for (let i = 0; i < 5; i++) {
    await expect(gw.execute({ query: '{ hello }' })).resolves.toMatchObject({
      data: { hello: 'world' },
    });
  }

  expect(planAsync).toHaveBeenCalledTimes(1);
  // the native cache key should not be computed on a plan cache hit
  // https://github.com/graphql-hive/gateway/issues/2655
  expect(computeCacheKey).toHaveBeenCalledTimes(1);
});

it('plans concurrent operations', async () => {
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    subgraphs: [
      {
        name: 'upstream',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
              world: String
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'world',
              world: () => 'hello',
            },
          },
        },
      },
    ],
  });

  // different documents so both are planned while the other one is in flight
  await expect(
    Promise.all([
      gw.execute({ query: '{ hello }' }),
      gw.execute({ query: '{ world }' }),
    ]),
  ).resolves.toEqual([
    { data: { hello: 'world' } },
    { data: { world: 'hello' } },
  ]);
});
