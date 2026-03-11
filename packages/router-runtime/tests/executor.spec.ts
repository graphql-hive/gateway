import type {
  BatchFetchNode,
  QueryPlan,
} from '@graphql-hive/router-query-planner';
import type { ExecutionResult } from '@graphql-tools/utils';
import { buildSchema, parse } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { executeQueryPlan } from '../src/executor';

const supergraphSchema = buildSchema(/* GraphQL */ `
  type Query {
    products: [Product]
    topProducts: [Product]
  }

  type Product {
    upc: String!
    name: String
    price: Int
    shippingEstimate: Int
    inStock: Boolean
  }
`);

function makeExecutionRequest(query: string) {
  const document = parse(query);
  return {
    document,
    variables: {},
    operationType: 'query' as const,
  } as any;
}

describe('BatchFetch plan node', () => {
  it('skips the fetch when executionContext has no matching entities', async () => {
    const onSubgraphExecute = vi.fn();

    const batchFetchNode: BatchFetchNode = {
      kind: 'BatchFetch',
      serviceName: 'inventory',
      operation:
        '{_e0:_entities(representations:$__batch_reps_0){...on Product{shippingEstimate}}}',
      entityBatch: {
        aliases: [
          {
            alias: '_e0',
            representationsVariableName: '__batch_reps_0',
            paths: [[{ Field: 'products' }, '@']],
            requires: [
              {
                kind: 'InlineFragment',
                typeCondition: 'Product',
                selections: [{ kind: 'Field', name: 'upc' }],
              },
            ],
            entitiesSelection: [
              {
                kind: 'InlineFragment',
                typeCondition: 'Product',
                selections: [{ kind: 'Field', name: 'shippingEstimate' }],
              },
            ],
          },
        ],
      },
    };

    const queryPlan: QueryPlan = {
      kind: 'QueryPlan',
      node: batchFetchNode,
    };

    await executeQueryPlan({
      queryPlan,
      executionRequest: makeExecutionRequest('{ products { upc name } }'),
      supergraphSchema,
      onSubgraphExecute,
    });

    // The executionContext starts with no data, so nothing to batch
    expect(onSubgraphExecute).not.toHaveBeenCalled();
  });

  it('executes a BatchFetch and merges entities back into data', async () => {
    const onSubgraphExecute = vi.fn(
      (_subgraphName: string, _req: any): ExecutionResult => ({
        data: {
          _e0: [
            { __typename: 'Product', shippingEstimate: 10 },
            { __typename: 'Product', shippingEstimate: 20 },
          ],
        },
      }),
    );

    // Sequence: Fetch(products) -> BatchFetch(inventory)
    const queryPlan: QueryPlan = {
      kind: 'QueryPlan',
      node: {
        kind: 'Sequence',
        nodes: [
          {
            kind: 'Fetch',
            serviceName: 'products',
            operation: '{products{__typename upc name}}',
            operationKind: 'query',
          },
          {
            kind: 'BatchFetch',
            serviceName: 'inventory',
            operation:
              '{_e0:_entities(representations:$__batch_reps_0){...on Product{shippingEstimate}}}',
            entityBatch: {
              aliases: [
                {
                  alias: '_e0',
                  representationsVariableName: '__batch_reps_0',
                  paths: [[{ Field: 'products' }, '@']],
                  requires: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: 'Product',
                      selections: [{ kind: 'Field', name: 'upc' }],
                    },
                  ],
                  entitiesSelection: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: 'Product',
                      selections: [{ kind: 'Field', name: 'shippingEstimate' }],
                    },
                  ],
                },
              ],
            },
          } as BatchFetchNode,
        ],
      },
    };

    await executeQueryPlan({
      queryPlan,
      executionRequest: makeExecutionRequest(
        '{ products { upc name shippingEstimate } }',
      ),
      supergraphSchema,
      onSubgraphExecute(subgraphName, req) {
        if (subgraphName === 'products') {
          return {
            data: {
              products: [
                { __typename: 'Product', upc: '1', name: 'Table' },
                { __typename: 'Product', upc: '2', name: 'Couch' },
              ],
            },
          };
        }
        return onSubgraphExecute(subgraphName, req);
      },
    });

    expect(onSubgraphExecute).toHaveBeenCalledTimes(1);
    expect(onSubgraphExecute).toHaveBeenCalledWith(
      'inventory',
      expect.objectContaining({
        variables: expect.objectContaining({
          __batch_reps_0: [
            { __typename: 'Product', upc: '1' },
            { __typename: 'Product', upc: '2' },
          ],
        }),
      }),
    );
  });

  it('executes a BatchFetch with two aliases in one request', async () => {
    const inventoryRequests: any[] = [];

    const queryPlan: QueryPlan = {
      kind: 'QueryPlan',
      node: {
        kind: 'Sequence',
        nodes: [
          {
            kind: 'Fetch',
            serviceName: 'products',
            operation: '{products{__typename upc name}}',
            operationKind: 'query',
          },
          {
            kind: 'BatchFetch',
            serviceName: 'inventory',
            operation:
              '{_e0:_entities(representations:$__batch_reps_0){...on Product{shippingEstimate}} _e1:_entities(representations:$__batch_reps_1){...on Product{inStock}}}',
            entityBatch: {
              aliases: [
                {
                  alias: '_e0',
                  representationsVariableName: '__batch_reps_0',
                  paths: [[{ Field: 'products' }, '@']],
                  requires: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: 'Product',
                      selections: [{ kind: 'Field', name: 'upc' }],
                    },
                  ],
                  entitiesSelection: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: 'Product',
                      selections: [{ kind: 'Field', name: 'shippingEstimate' }],
                    },
                  ],
                },
                {
                  alias: '_e1',
                  representationsVariableName: '__batch_reps_1',
                  paths: [[{ Field: 'products' }, '@']],
                  requires: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: 'Product',
                      selections: [{ kind: 'Field', name: 'upc' }],
                    },
                  ],
                  entitiesSelection: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: 'Product',
                      selections: [{ kind: 'Field', name: 'inStock' }],
                    },
                  ],
                },
              ],
            },
          } as BatchFetchNode,
        ],
      },
    };

    await executeQueryPlan({
      queryPlan,
      executionRequest: makeExecutionRequest(
        '{ products { upc name shippingEstimate inStock } }',
      ),
      supergraphSchema,
      onSubgraphExecute(subgraphName, req) {
        if (subgraphName === 'products') {
          return {
            data: {
              products: [
                { __typename: 'Product', upc: '1', name: 'Table' },
                { __typename: 'Product', upc: '2', name: 'Couch' },
              ],
            },
          };
        }
        // Record inventory requests
        inventoryRequests.push(req);
        return {
          data: {
            _e0: [
              { __typename: 'Product', shippingEstimate: 10 },
              { __typename: 'Product', shippingEstimate: 20 },
            ],
            _e1: [
              { __typename: 'Product', inStock: true },
              { __typename: 'Product', inStock: false },
            ],
          },
        };
      },
    });

    // Both aliases should be sent in a single subgraph request
    expect(inventoryRequests).toHaveLength(1);
    expect(inventoryRequests[0].variables.__batch_reps_0).toEqual([
      { __typename: 'Product', upc: '1' },
      { __typename: 'Product', upc: '2' },
    ]);
    expect(inventoryRequests[0].variables.__batch_reps_1).toEqual([
      { __typename: 'Product', upc: '1' },
      { __typename: 'Product', upc: '2' },
    ]);
  });

  it('deduplicates representations across paths sharing the same variable name', async () => {
    const inventoryRequests: any[] = [];

    // Two paths (products.@ and topProducts.@) share the same _e0 alias and variable.
    // Product upc '1' appears in both lists but should be sent only once.
    const queryPlan: QueryPlan = {
      kind: 'QueryPlan',
      node: {
        kind: 'Sequence',
        nodes: [
          {
            kind: 'Fetch',
            serviceName: 'products',
            operation:
              '{products{__typename upc name} topProducts{__typename upc name}}',
            operationKind: 'query',
          },
          {
            kind: 'BatchFetch',
            serviceName: 'inventory',
            operation:
              '{_e0:_entities(representations:$__batch_reps_0){...on Product{shippingEstimate}}}',
            entityBatch: {
              aliases: [
                {
                  alias: '_e0',
                  representationsVariableName: '__batch_reps_0',
                  paths: [
                    [{ Field: 'products' }, '@'],
                    [{ Field: 'topProducts' }, '@'],
                  ],
                  requires: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: 'Product',
                      selections: [{ kind: 'Field', name: 'upc' }],
                    },
                  ],
                  entitiesSelection: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: 'Product',
                      selections: [{ kind: 'Field', name: 'shippingEstimate' }],
                    },
                  ],
                },
              ],
            },
          } as BatchFetchNode,
        ],
      },
    };

    await executeQueryPlan({
      queryPlan,
      executionRequest: makeExecutionRequest(
        '{ products { upc name shippingEstimate } topProducts { upc name shippingEstimate } }',
      ),
      supergraphSchema,
      onSubgraphExecute(subgraphName, req) {
        if (subgraphName === 'products') {
          return {
            data: {
              products: [
                { __typename: 'Product', upc: '1', name: 'Table' },
                { __typename: 'Product', upc: '2', name: 'Couch' },
              ],
              topProducts: [
                { __typename: 'Product', upc: '1', name: 'Table' }, // duplicate!
                { __typename: 'Product', upc: '3', name: 'Chair' },
              ],
            },
          };
        }
        inventoryRequests.push(req);
        return {
          data: {
            _e0: [
              { __typename: 'Product', shippingEstimate: 10 },
              { __typename: 'Product', shippingEstimate: 20 },
              { __typename: 'Product', shippingEstimate: 30 },
            ],
          },
        };
      },
    });

    expect(inventoryRequests).toHaveLength(1);
    const reps = inventoryRequests[0].variables.__batch_reps_0;
    // upc '1' from products + topProducts should be deduplicated
    expect(reps).toEqual([
      { __typename: 'Product', upc: '1' },
      { __typename: 'Product', upc: '2' },
      { __typename: 'Product', upc: '3' },
    ]);
  });

  it('skips the BatchFetch when the products list is empty', async () => {
    const inventoryCallCount = { count: 0 };

    const queryPlan: QueryPlan = {
      kind: 'QueryPlan',
      node: {
        kind: 'Sequence',
        nodes: [
          {
            kind: 'Fetch',
            serviceName: 'products',
            operation: '{products{__typename upc name}}',
            operationKind: 'query',
          },
          {
            kind: 'BatchFetch',
            serviceName: 'inventory',
            operation:
              '{_e0:_entities(representations:$__batch_reps_0){...on Product{shippingEstimate}}}',
            entityBatch: {
              aliases: [
                {
                  alias: '_e0',
                  representationsVariableName: '__batch_reps_0',
                  paths: [[{ Field: 'products' }, '@']],
                  requires: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: 'Product',
                      selections: [{ kind: 'Field', name: 'upc' }],
                    },
                  ],
                  entitiesSelection: [],
                },
              ],
            },
          } as BatchFetchNode,
        ],
      },
    };

    await executeQueryPlan({
      queryPlan,
      executionRequest: makeExecutionRequest(
        '{ products { upc name shippingEstimate } }',
      ),
      supergraphSchema,
      onSubgraphExecute(subgraphName) {
        if (subgraphName === 'products') {
          return { data: { products: [] } };
        }
        inventoryCallCount.count++;
        return { data: {} };
      },
    });

    // BatchFetch should be skipped because products is empty
    expect(inventoryCallCount.count).toBe(0);
  });
});
