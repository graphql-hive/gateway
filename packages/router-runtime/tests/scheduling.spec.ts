import { createGatewayTester } from '@graphql-hive/gateway-testing';
import type {
  FetchNode,
  QueryPlan,
  RequiresSelection,
} from '@graphql-hive/router-query-planner';
import type { ExecutionResult } from '@graphql-tools/utils';
import { assertSingleExecutionValue } from '@internal/testing';
import { createDeferredPromise } from '@whatwg-node/promise-helpers';
import { buildSchema, parse } from 'graphql';
import { expect, it } from 'vitest';
import { executeQueryPlan } from '../src/executor';
import { unifiedGraphHandler } from '../src/index';

it('starts a fetch once its dependencies are done without waiting for unrelated ones', async () => {
  const events: string[] = [];
  const accountsCalled = createDeferredPromise<void>();
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    subgraphs: [
      {
        name: 'products',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              topProducts: [Product]
            }
            type Product @key(fields: "upc") {
              upc: String!
            }
          `,
          resolvers: {
            Query: {
              topProducts: () => [{ upc: '1' }],
            },
          },
        },
      },
      {
        name: 'inventory',
        schema: {
          typeDefs: /* GraphQL */ `
            type Product @key(fields: "upc") {
              upc: String!
              inStock: Boolean
            }
          `,
          resolvers: {
            Product: {
              __resolveReference: async (product: { upc: string }) => {
                // slow until accounts is asked, which never happens when accounts waits for us
                let timeout: ReturnType<typeof setTimeout> | undefined;
                await Promise.race([
                  accountsCalled.promise,
                  new Promise((resolve) => {
                    timeout = setTimeout(resolve, 1_000);
                  }),
                ]);
                // the pending timer would otherwise outlive the test and leak
                clearTimeout(timeout);
                events.push('inventory done');
                return { ...product, inStock: true };
              },
            },
          },
        },
      },
      {
        name: 'reviews',
        schema: {
          typeDefs: /* GraphQL */ `
            type Product @key(fields: "upc") {
              upc: String!
              reviews: [Review]
            }
            type Review {
              author: User
            }
            type User @key(fields: "id") {
              id: ID!
            }
          `,
          resolvers: {
            Product: {
              __resolveReference: (product: { upc: string }) => ({
                ...product,
                reviews: [{ author: { id: 'u1' } }],
              }),
            },
          },
        },
      },
      {
        name: 'accounts',
        schema: {
          typeDefs: /* GraphQL */ `
            type User @key(fields: "id") {
              id: ID!
              name: String
            }
          `,
          resolvers: {
            User: {
              __resolveReference: (user: { id: string }) => {
                events.push('accounts');
                accountsCalled.resolve();
                return { ...user, name: 'Ada' };
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
        topProducts {
          upc
          inStock
          reviews {
            author {
              name
            }
          }
        }
      }
    `,
  });

  assertSingleExecutionValue(result);
  expect(result).toEqual({
    data: {
      topProducts: [
        { upc: '1', inStock: true, reviews: [{ author: { name: 'Ada' } }] },
      ],
    },
  });
  // accounts only needs reviews, it must not wait for the slow inventory
  expect(events).toEqual(['accounts', 'inventory done']);
});

const supergraphSchema = buildSchema(/* GraphQL */ `
  type Query {
    a: String
    b: String
    c: String
    d: String
    products: [Product]
  }

  type Subscription {
    product: Product
  }

  type Product {
    id: ID!
    name: String
  }
`);

const productRequires: RequiresSelection[] = [
  {
    kind: 'InlineFragment',
    typeCondition: 'Product',
    selections: [
      { kind: 'Field', name: '__typename' },
      { kind: 'Field', name: 'id' },
    ],
  },
];

/** A root fetch of the field named like the subgraph it goes to. */
function rootFetch(
  id: number,
  serviceName: string,
  dependsOn: number[] = [],
  node: Partial<FetchNode> = {},
): FetchNode {
  return {
    kind: 'Fetch',
    serviceName,
    operation: `{${serviceName}}`,
    id,
    dependsOn,
    ...node,
  };
}

// a rewrite the executor doesn't know makes it throw while merging the result
const throwingRewrites = [
  { Bogus: {} },
] as unknown as FetchNode['outputRewrites'];

it('starts no fetch after one throws while starting the plan', async () => {
  const calls: string[] = [];
  const a = createDeferredPromise<ExecutionResult>();
  const a2 = createDeferredPromise<ExecutionResult>();
  const queryPlan: QueryPlan = {
    kind: 'QueryPlan',
    node: {
      kind: 'Sequence',
      nodes: [
        {
          kind: 'Parallel',
          nodes: [
            rootFetch(1, 'a'),
            rootFetch(2, 'a2', [], { outputRewrites: throwingRewrites }),
            rootFetch(3, 'b', [], { outputRewrites: throwingRewrites }),
            rootFetch(4, 'c'),
          ],
        },
        rootFetch(5, 'd', [1]),
      ],
    },
    projection: { rootType: 'Query', fields: [] },
  };

  expect(() =>
    executeQueryPlan({
      queryPlan,
      supergraphSchema,
      entityKeys: {},
      possibleTypes: {},
      executionRequest: { document: parse('{ a b c d }') },
      onSubgraphExecute(subgraphName) {
        calls.push(subgraphName);
        if (subgraphName === 'a') {
          return a.promise;
        }
        if (subgraphName === 'a2') {
          return a2.promise;
        }
        return { data: { [subgraphName]: subgraphName } };
      },
    }),
  ).toThrow('Unsupported fetch node rewrite');

  // the fetches that were already running finish, one of them failing too, which must not
  // leave an unhandled rejection
  a.resolve({ data: { a: 'a' } });
  a2.resolve({ data: { a2: 'a2' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calls).toEqual(['a', 'a2', 'b']);
});

it('starts no dependents of a running fetch after another one failed', async () => {
  const calls: string[] = [];
  const a = createDeferredPromise<ExecutionResult>();
  const b = createDeferredPromise<ExecutionResult>();
  const queryPlan: QueryPlan = {
    kind: 'QueryPlan',
    node: {
      kind: 'Sequence',
      nodes: [
        {
          kind: 'Parallel',
          nodes: [
            rootFetch(1, 'a', [], { outputRewrites: throwingRewrites }),
            rootFetch(2, 'b'),
          ],
        },
        rootFetch(3, 'c', [2]),
      ],
    },
    projection: { rootType: 'Query', fields: [] },
  };

  const result = executeQueryPlan({
    queryPlan,
    supergraphSchema,
    entityKeys: {},
    possibleTypes: {},
    executionRequest: { document: parse('{ a b c }') },
    onSubgraphExecute(subgraphName) {
      calls.push(subgraphName);
      if (subgraphName === 'a') {
        return a.promise;
      }
      if (subgraphName === 'b') {
        return b.promise;
      }
      return { data: { [subgraphName]: subgraphName } };
    },
  });

  a.resolve({ data: { a: 'a' } });
  await expect(result).rejects.toThrow('Unsupported fetch node rewrite');
  b.resolve({ data: { b: 'b' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calls).toEqual(['a', 'b']);
});

it('releases the dependents of a fetch that is off and of a flatten without entities', async () => {
  const calls: string[] = [];
  const queryPlan: QueryPlan = {
    kind: 'QueryPlan',
    node: {
      kind: 'Sequence',
      nodes: [
        rootFetch(1, 'a', [], { runIf: [{ includeIf: ['x'] }] }),
        rootFetch(2, 'b', [1], { operation: '{products{__typename id}}' }),
        {
          kind: 'Flatten',
          path: [{ Field: 'products' }, '@'],
          node: {
            kind: 'Fetch',
            serviceName: 'c',
            operation:
              'query($representations:[_Any!]!){_entities(representations:$representations){...on Product{name}}}',
            requires: productRequires,
            id: 3,
            dependsOn: [2],
          },
        },
        rootFetch(4, 'd', [3]),
      ],
    },
    projection: { rootType: 'Query', fields: [{ name: 'd' }] },
  };

  const result = await executeQueryPlan({
    queryPlan,
    supergraphSchema,
    entityKeys: {},
    possibleTypes: {},
    executionRequest: {
      document: parse('query ($x: Boolean!) { a @include(if: $x) d }'),
      variables: { x: false },
    },
    onSubgraphExecute(subgraphName) {
      calls.push(subgraphName);
      if (subgraphName === 'b') {
        return { data: { products: [] } };
      }
      return { data: { [subgraphName]: subgraphName } };
    },
  });

  expect(calls).toEqual(['b', 'd']);
  expect(result).toEqual({ data: { d: 'd' } });
});

it('runs the dependent entity fetch for every subscription event', async () => {
  const queryPlan: QueryPlan = {
    kind: 'QueryPlan',
    node: {
      kind: 'Sequence',
      nodes: [
        {
          kind: 'Subscription',
          primary: rootFetch(1, 'a', [], {
            operationKind: 'subscription',
            operation: 'subscription{product{__typename id}}',
          }),
        },
        {
          kind: 'Flatten',
          path: [{ Field: 'product' }],
          node: {
            kind: 'Fetch',
            serviceName: 'b',
            operationKind: 'query',
            operation:
              'query($representations:[_Any!]!){_entities(representations:$representations){...on Product{name}}}',
            requires: productRequires,
            id: 2,
            dependsOn: [1],
          },
        },
      ],
    },
    projection: {
      rootType: 'Subscription',
      fields: [{ name: 'product', selections: [{ name: 'name' }] }],
    },
  };

  const result = await executeQueryPlan({
    queryPlan,
    supergraphSchema,
    entityKeys: {},
    possibleTypes: {},
    executionRequest: {
      document: parse('subscription { product { name } }'),
    },
    onSubgraphExecute(subgraphName, { variables }) {
      if (subgraphName === 'a') {
        return (async function* () {
          yield { data: { product: { __typename: 'Product', id: '1' } } };
          yield { data: { product: { __typename: 'Product', id: '2' } } };
        })();
      }
      return {
        data: {
          _entities: variables!['representations'].map(
            (representation: { id: string }) => ({
              name: `Product ${representation.id}`,
            }),
          ),
        },
      };
    },
  });

  const events: unknown[] = [];
  for await (const event of result as AsyncIterable<ExecutionResult>) {
    events.push(event);
  }
  expect(events).toEqual([
    { data: { product: { name: 'Product 1' } } },
    { data: { product: { name: 'Product 2' } } },
  ]);
});
