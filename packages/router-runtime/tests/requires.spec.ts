import { createGatewayTester } from '@graphql-hive/gateway-testing';
import type { QueryPlan } from '@graphql-hive/router-query-planner';
import { assertSingleExecutionValue } from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
import { buildSchema, GraphQLError, parse } from 'graphql';
import { expect, it } from 'vitest';
import { executeQueryPlan } from '../src/executor';
import { unifiedGraphHandler } from '../src/index';

// https://github.com/graphql-hive/router/issues/1669
const typenameKeySupergraph = /* GraphQL */ `
  schema
    @link(url: "https://specs.apollo.dev/link/v1.0")
    @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) {
    query: Query
  }

  directive @join__field(
    graph: join__Graph
    requires: join__FieldSet
    provides: join__FieldSet
    type: String
    external: Boolean
    override: String
    usedOverridden: Boolean
  ) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

  directive @join__graph(name: String!, url: String!) on ENUM_VALUE

  directive @join__type(
    graph: join__Graph!
    key: join__FieldSet
    extension: Boolean! = false
    resolvable: Boolean! = true
    isInterfaceObject: Boolean! = false
  ) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

  directive @link(
    url: String
    as: String
    for: link__Purpose
    import: [link__Import]
  ) repeatable on SCHEMA

  scalar join__FieldSet

  scalar link__Import

  enum link__Purpose {
    SECURITY
    EXECUTION
  }

  enum join__Graph {
    CONTENT @join__graph(name: "content", url: "http://content/graphql")
    FAVORITES @join__graph(name: "favorites", url: "http://favorites/graphql")
    PETSEARCH @join__graph(name: "petsearch", url: "http://petsearch/graphql")
  }

  type FavoritesPage
    @join__type(graph: CONTENT, key: "__typename")
    @join__type(graph: FAVORITES, key: "__typename")
    @join__type(graph: PETSEARCH, key: "__typename") {
    title: String @join__field(graph: CONTENT)
    petCount: Int
      @join__field(graph: FAVORITES)
      @join__field(graph: PETSEARCH, external: true)
    searchBox: SearchBox! @join__field(graph: PETSEARCH, requires: "petCount")
  }

  type SearchBox @join__type(graph: PETSEARCH) {
    placeholder: String
  }

  type Query
    @join__type(graph: CONTENT)
    @join__type(graph: FAVORITES)
    @join__type(graph: PETSEARCH) {
    favoritesPage: FavoritesPage @join__field(graph: CONTENT)
  }
`;

it('sends an entity keyed by __typename alone with its null required field', async () => {
  const representations: unknown[] = [];
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    supergraph: typenameKeySupergraph,
    plugins: () => [
      {
        onFetch({ url, options, setFetchFn }) {
          const { variables } = JSON.parse(String(options.body));
          const subgraph = new URL(url).hostname;
          setFetchFn(() => {
            if (subgraph === 'content') {
              return Response.json({
                data: { favoritesPage: { __typename: 'FavoritesPage' } },
              });
            }
            if (subgraph === 'favorites') {
              // can't resolve the page, like for a logged-out user
              return Response.json({ data: { _entities: [null] } });
            }
            representations.push(...variables.representations);
            return Response.json({
              data: {
                _entities: [{ searchBox: { placeholder: 'Find a pet' } }],
              },
            });
          });
        },
      },
    ],
  });

  const result = await gw.execute({
    query: '{ favoritesPage { searchBox { placeholder } } }',
  });

  assertSingleExecutionValue(result);
  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    favoritesPage: { searchBox: { placeholder: 'Find a pet' } },
  });
  expect(representations).toEqual([
    { __typename: 'FavoritesPage', petCount: null },
  ]);
});

it('sends an object inside a representation that misses a selected field as null', async () => {
  const supergraphSchema = buildSchema(/* GraphQL */ `
    type Query {
      products: [Product]
    }

    type Product {
      id: ID!
      size: Size
      sizes: [Size]
      shipping: Int
    }

    type Size {
      width: Int
      height: Int
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
          operation: '{products{__typename id size{width} sizes{width}}}',
        },
        {
          kind: 'Flatten',
          path: [{ Field: 'products' }, '@'],
          node: {
            kind: 'Fetch',
            serviceName: 'b',
            operationKind: 'query',
            operation:
              'query($representations:[_Any!]!){_entities(representations: $representations){...on Product{shipping}}}',
            requires: [
              {
                kind: 'InlineFragment',
                typeCondition: 'Product',
                selections: [
                  { kind: 'Field', name: '__typename' },
                  { kind: 'Field', name: 'id' },
                  {
                    kind: 'Field',
                    name: 'size',
                    selections: [
                      { kind: 'Field', name: 'width' },
                      { kind: 'Field', name: 'height' },
                    ],
                  },
                  {
                    kind: 'Field',
                    name: 'sizes',
                    selections: [
                      { kind: 'Field', name: 'width' },
                      { kind: 'Field', name: 'height' },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  };

  const representations: unknown[] = [];
  await executeQueryPlan({
    queryPlan,
    supergraphSchema,
    executionRequest: { document: parse('{ products { shipping } }') },
    onSubgraphExecute(subgraphName, { variables }) {
      if (subgraphName === 'a') {
        // the fetch for the heights failed
        return {
          data: {
            products: [
              {
                __typename: 'Product',
                id: '1',
                size: { width: 1 },
                sizes: [{ width: 1, height: 2 }, { width: 3 }, null],
              },
            ],
          },
        };
      }
      representations.push(...variables!['representations']);
      return { data: { _entities: [{ shipping: 2 }] } };
    },
  });

  expect(representations).toEqual([
    {
      __typename: 'Product',
      id: '1',
      size: null,
      sizes: [{ width: 1, height: 2 }, null, null],
    },
  ]);
});

it('cuts error paths at the first field the client did not ask for', async () => {
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    subgraphs: [
      {
        name: 'products',
        schema: {
          typeDefs: /* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key"]
              )
            type Query {
              products: [Product]
            }
            type Product @key(fields: "id") {
              id: ID!
              weight: Int
            }
          `,
          resolvers: {
            Query: {
              products: () => [{ id: '1' }],
            },
            Product: {
              weight: () => {
                throw new GraphQLError('No weight');
              },
            },
          },
        },
      },
      {
        name: 'shipping',
        schema: {
          typeDefs: /* GraphQL */ `
            extend schema
              @link(
                url: "https://specs.apollo.dev/federation/v2.3"
                import: ["@key", "@external", "@requires"]
              )
            type Product @key(fields: "id") {
              id: ID!
              weight: Int @external
              shippingEstimate: Int @requires(fields: "weight")
            }
          `,
          resolvers: {
            Product: {
              __resolveReference: (product: unknown) => product,
              shippingEstimate: ({ weight }: { weight: number | null }) =>
                weight ?? 0,
            },
          },
        },
      },
    ],
  });

  const result = await gw.execute({
    query: '{ products { shippingEstimate } }',
  });

  assertSingleExecutionValue(result);
  expect(result.data).toEqual({ products: [{ shippingEstimate: 0 }] });
  expect(
    result.errors?.map(({ message, path }) => ({ message, path })),
  ).toEqual([{ message: 'No weight', path: ['products', 0] }]);
});
