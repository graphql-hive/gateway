import { createGatewayTester } from '@graphql-hive/gateway-testing';
import type { QueryPlan } from '@graphql-hive/router-query-planner';
import type { ExecutionResult } from '@graphql-tools/utils';
import { Response } from '@whatwg-node/fetch';
import {
  buildSchema,
  Kind,
  parse,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from 'graphql';
import { expect, it } from 'vitest';
import { executeQueryPlan } from '../src/executor';
import { unifiedGraphHandler, useQueryPlan } from '../src/index';

// `T.id` is the key `c` needs. when the client uses the response key `id` for another
// field, the planner fetches the key from `b` under an internal alias
const supergraph = /* GraphQL */ `
  schema
    @link(url: "https://specs.apollo.dev/link/v1.0")
    @link(url: "https://specs.apollo.dev/join/v0.5", for: EXECUTION) {
    query: Query
  }

  directive @join__directive(
    graphs: [join__Graph!]
    name: String!
    args: join__DirectiveArguments
  ) repeatable on SCHEMA | OBJECT | INTERFACE | FIELD_DEFINITION

  directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

  directive @join__field(
    graph: join__Graph
    requires: join__FieldSet
    provides: join__FieldSet
    type: String
    external: Boolean
    override: String
    usedOverridden: Boolean
    overrideLabel: String
    contextArguments: [join__ContextArgument!]
  ) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

  directive @join__graph(name: String!, url: String!) on ENUM_VALUE

  directive @join__implements(
    graph: join__Graph!
    interface: String!
  ) repeatable on OBJECT | INTERFACE

  directive @join__type(
    graph: join__Graph!
    key: join__FieldSet
    extension: Boolean! = false
    resolvable: Boolean! = true
    isInterfaceObject: Boolean! = false
  ) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

  directive @join__unionMember(
    graph: join__Graph!
    member: String!
  ) repeatable on UNION

  directive @link(
    url: String
    as: String
    for: link__Purpose
    import: [link__Import]
  ) repeatable on SCHEMA

  input join__ContextArgument {
    name: String!
    type: String!
    context: String!
    selection: join__FieldValue!
  }

  scalar join__DirectiveArguments

  scalar join__FieldSet

  scalar join__FieldValue

  enum join__Graph {
    A @join__graph(name: "a", url: "http://a/graphql")
    B @join__graph(name: "b", url: "http://b/graphql")
    C @join__graph(name: "c", url: "http://c/graphql")
  }

  scalar link__Import

  enum link__Purpose {
    SECURITY
    EXECUTION
  }

  type Query @join__type(graph: A) @join__type(graph: B) @join__type(graph: C) {
    t: T @join__field(graph: A) @join__field(graph: B)
  }

  type T
    @join__type(graph: A)
    @join__type(graph: B, key: "id")
    @join__type(graph: C, key: "id") {
    x: Int @join__field(graph: A) @join__field(graph: C)
    id: ID! @join__field(graph: B) @join__field(graph: C)
    y: Int @join__field(graph: C)
  }
`;

// what every subgraph has for `t`, `c` resolves it as an entity
const subgraphs = {
  a: { x: 7 },
  b: { __typename: 'T', id: '1' },
  c: { __typename: 'T', x: 7, id: '1', y: 41 },
};

/** Answers the selections with the values in `source`, by field name, under their response keys. */
function resolve(selectionSet: SelectionSetNode, source: any): any {
  if (Array.isArray(source)) {
    return source.map((item) => resolve(selectionSet, item));
  }
  const result: Record<string, unknown> = {};
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const value = source[selection.name.value];
      result[selection.alias?.value ?? selection.name.value] =
        selection.selectionSet && value != null
          ? resolve(selection.selectionSet, value)
          : value;
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      Object.assign(result, resolve(selection.selectionSet, source));
    }
  }
  return result;
}

it.each([
  {
    query: '{ t { x: id id: x y } }',
    data: { t: { x: '1', id: 7, y: 41 } },
  },
  {
    query: '{ t { x: id id: y } }',
    data: { t: { x: '1', id: 41 } },
  },
])(
  'sends the aliased key, not the client field under its name, for $query',
  async ({ query, data }) => {
    const representations: unknown[] = [];
    await using gw = createGatewayTester({
      unifiedGraphHandler,
      supergraph,
      plugins: () => [
        useQueryPlan({ expose: true }),
        {
          onFetch({ url, options, setFetchFn }) {
            const { query, variables } = JSON.parse(String(options.body));
            const operation = parse(query)
              .definitions[0] as OperationDefinitionNode;
            const subgraph = new URL(url).hostname as 'a' | 'b' | 'c';
            setFetchFn(() => {
              if (subgraph === 'c') {
                representations.push(...variables.representations);
              }
              return Response.json({
                data: resolve(operation.selectionSet, {
                  t: subgraphs[subgraph],
                  _entities: variables?.representations.map(
                    () => subgraphs[subgraph],
                  ),
                }),
              });
            });
          },
        },
      ],
    });

    const result = (await gw.execute({ query })) as ExecutionResult;

    // guard: the key must actually be fetched under an alias
    expect(JSON.stringify(result.extensions?.queryPlan)).toContain(
      '_internal_qp_alias_',
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual(data);
    expect(representations).toEqual([{ __typename: 'T', id: '1' }]);
  },
);

it('reads an aliased required field only from its alias', async () => {
  const supergraphSchema = buildSchema(/* GraphQL */ `
    type Query {
      products: [Product]
    }

    type Product {
      id: ID!
      price(currency: String!): Int
      shipping: Int
    }
  `);
  // the client asks for `price(currency: "USD")` and `shipping`, which requires the
  // `price(currency: "EUR")` that `b` resolves under an internal alias
  const queryPlan: QueryPlan = {
    kind: 'QueryPlan',
    node: {
      kind: 'Sequence',
      nodes: [
        {
          kind: 'Fetch',
          serviceName: 'a',
          operationKind: 'query',
          operation: '{products{__typename id price(currency: "USD")}}',
        },
        {
          kind: 'Flatten',
          path: [{ Field: 'products' }, '@'],
          node: {
            kind: 'Fetch',
            serviceName: 'b',
            operationKind: 'query',
            operation:
              'query($representations:[_Any!]!){_entities(representations: $representations){...on Product{_internal_qp_alias_0: price(currency: "EUR")}}}',
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
          },
        },
        {
          kind: 'Flatten',
          path: [{ Field: 'products' }, '@'],
          node: {
            kind: 'Fetch',
            serviceName: 'c',
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
                    name: '_internal_qp_alias_0',
                    alias: 'price',
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
    executionRequest: {
      document: parse('{ products { price(currency: "USD") shipping } }'),
    },
    onSubgraphExecute(subgraphName, { variables }) {
      if (subgraphName === 'a') {
        return {
          data: { products: [{ __typename: 'Product', id: '1', price: 1 }] },
        };
      }
      if (subgraphName === 'b') {
        // the eur price couldn't be resolved for the product
        return { data: { _entities: [null] } };
      }
      representations.push(...variables!['representations']);
      return { data: { _entities: [{ shipping: 2 }] } };
    },
  });

  // the client's usd price must not be sent as the eur one
  expect(representations).toEqual([{ __typename: 'Product', id: '1' }]);
});
