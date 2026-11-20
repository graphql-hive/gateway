import type { QueryPlan } from '@graphql-hive/router-query-planner';
import { buildSchema, parse } from 'graphql';
import { expect, it } from 'vitest';
import { executeQueryPlan } from '../src/executor';

it('replaces a custom scalar object instead of merging it with what another fetch brought', async () => {
  const supergraphSchema = buildSchema(/* GraphQL */ `
    scalar JSON

    type Query {
      products: [Product]
    }

    type Product {
      id: ID!
      meta: JSON
    }
  `);
  const queryPlan: QueryPlan = {
    kind: 'QueryPlan',
    node: {
      kind: 'Sequence',
      nodes: [
        {
          kind: 'Fetch',
          serviceName: 'a',
          operationKind: 'query',
          operation: '{products{__typename id meta}}',
          customScalarPaths: {
            children: {
              products: { children: { meta: { terminal: true } } },
            },
          },
          id: 1,
          dependsOn: [],
        },
        {
          kind: 'Flatten',
          path: [{ Field: 'products' }, '@'],
          node: {
            kind: 'Fetch',
            serviceName: 'b',
            operationKind: 'query',
            operation:
              'query($representations:[_Any!]!){_entities(representations: $representations){...on Product{meta}}}',
            customScalarPaths: {
              children: {
                _entities: { children: { meta: { terminal: true } } },
              },
            },
            requires: [
              {
                kind: 'InlineFragment',
                typeCondition: 'Product',
                selections: [
                  { kind: 'Field', name: '__typename' },
                  { kind: 'Field', name: 'id' },
                ],
              },
            ],
            id: 2,
            dependsOn: [1],
          },
        },
      ],
    },
    projection: {
      rootType: 'Query',
      fields: [
        {
          name: 'products',
          itemNonNull: [false],
          selections: [{ name: 'meta' }],
        },
      ],
    },
  };

  const result = await executeQueryPlan({
    queryPlan,
    supergraphSchema,
    entityKeys: {},
    possibleTypes: {},
    executionRequest: { document: parse('{ products { meta } }') },
    onSubgraphExecute(subgraphName) {
      if (subgraphName === 'a') {
        return {
          data: {
            products: [
              { __typename: 'Product', id: '1', meta: { a: 1, list: [1, 2] } },
            ],
          },
        };
      }
      return { data: { _entities: [{ meta: { b: 2, list: [3] } }] } };
    },
  });

  expect(result).toEqual({
    data: { products: [{ meta: { b: 2, list: [3] } }] },
  });
});
