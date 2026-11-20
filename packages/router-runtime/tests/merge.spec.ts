import type { QueryPlan } from '@graphql-hive/router-query-planner';
import { buildSchema, GraphQLError, parse, print } from 'graphql';
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

it('keeps the value of an earlier fetch when a later one returns null for it', async () => {
  const supergraphSchema = buildSchema(/* GraphQL */ `
    type Query {
      products: [Product]
    }

    type Product {
      id: ID!
      name: String
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
          operation: '{products{__typename id name}}',
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
              'query($representations:[_Any!]!){_entities(representations: $representations){...on Product{name}}}',
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
          selections: [{ name: 'name' }],
        },
      ],
    },
  };

  const result = await executeQueryPlan({
    queryPlan,
    supergraphSchema,
    entityKeys: {},
    possibleTypes: {},
    executionRequest: { document: parse('{ products { name } }') },
    onSubgraphExecute(subgraphName) {
      if (subgraphName === 'a') {
        return {
          data: {
            products: [{ __typename: 'Product', id: '1', name: 'Chair' }],
          },
        };
      }
      return { data: { _entities: [{ name: null }] } };
    },
  });

  expect(result).toEqual({ data: { products: [{ name: 'Chair' }] } });
});

it('merges a root type re-entry into every object its flatten path reaches', async () => {
  const supergraphSchema = buildSchema(/* GraphQL */ `
    type Query {
      a: String
      x: String
    }

    type Mutation {
      do: [Payload]
    }

    type Payload {
      query: Query
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
          operationKind: 'mutation',
          operation: 'mutation{do{query{__typename a}}}',
          id: 2,
          dependsOn: [],
        },
        {
          kind: 'Flatten',
          path: [{ Field: 'do' }, '@', { Field: 'query' }],
          node: {
            kind: 'Fetch',
            serviceName: 'b',
            operationKind: 'query',
            operation: '{x}',
            id: 3,
            dependsOn: [2],
          },
        },
      ],
    },
    projection: {
      rootType: 'Mutation',
      fields: [
        {
          name: 'do',
          itemNonNull: [false],
          selections: [
            {
              name: 'query',
              selections: [{ name: 'a' }, { name: 'x' }],
            },
          ],
        },
      ],
    },
  };

  const requests: { operationType: unknown; document: string }[] = [];
  const result = await executeQueryPlan({
    queryPlan,
    supergraphSchema,
    entityKeys: {},
    possibleTypes: {},
    executionRequest: { document: parse('mutation { do { query { a x } } }') },
    onSubgraphExecute(subgraphName, { operationType, document }) {
      requests.push({ operationType, document: print(document) });
      if (subgraphName === 'a') {
        return {
          data: {
            do: [
              { query: { __typename: 'Query', a: '1' } },
              { query: null },
              { query: { __typename: 'Query', a: '2' } },
            ],
          },
        };
      }
      return {
        data: { x: 'x' },
        errors: [new GraphQLError('x is partial')],
      };
    },
  });

  expect(requests).toEqual([
    { operationType: 'mutation', document: print(parse('mutation{do{query{__typename a}}}')) },
    { operationType: 'query', document: print(parse('{x}')) },
  ]);
  expect(result).toEqual({
    data: {
      do: [
        { query: { a: '1', x: 'x' } },
        { query: null },
        { query: { a: '2', x: 'x' } },
      ],
    },
    errors: [
      expect.objectContaining({ message: 'x is partial', path: ['do', 'query'] }),
    ],
  });
});
