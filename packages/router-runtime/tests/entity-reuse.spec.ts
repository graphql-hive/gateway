import type { QueryPlan } from '@graphql-hive/router-query-planner';
import type { ExecutionRequest, ExecutionResult } from '@graphql-tools/utils';
import { buildSchema, GraphQLError, parse, print } from 'graphql';
import { expect, it } from 'vitest';
import { executeQueryPlan } from '../src/executor';

const supergraphSchema = buildSchema(/* GraphQL */ `
  type Query {
    users: [User]
  }

  type User {
    id: ID!
    name: String
    address: Address
    reviews: [Review]
  }

  type Address {
    city: String
  }

  type Review {
    body: String
    author: User
  }
`);

const userRequires = [
  {
    kind: 'InlineFragment' as const,
    typeCondition: 'User',
    selections: [
      { kind: 'Field' as const, name: '__typename' },
      { kind: 'Field' as const, name: 'id' },
    ],
  },
];

const projection: QueryPlan['projection'] = {
  rootType: 'Query',
  fields: [
    {
      name: 'users',
      itemNonNull: [false],
      selections: [
        { name: 'id', nonNull: true },
        { name: 'name' },
        {
          name: 'reviews',
          itemNonNull: [false],
          selections: [
            {
              name: 'author',
              selections: [
                { name: 'id', nonNull: true },
                { name: 'name' },
                { name: 'address', selections: [{ name: 'city' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * `users` from `a`, their reviews from `b`, then the review authors' `name` and `address` from
 * `a` again, copied from `users` with entity reuse. Returns the plan and the requests sent.
 */
function planAuthorsFromUsers(
  authorsFetch: 'Fetch' | 'BatchFetch' = 'Fetch',
): QueryPlan {
  const entityReuse = {
    sources: [[{ Field: 'users' }, '@'] as const],
    copy: [
      {
        kind: 'InlineFragment',
        typeCondition: 'User',
        selections: [
          { kind: 'Field', name: 'name' },
          {
            kind: 'Field',
            name: 'address',
            selections: [{ kind: 'Field', name: 'city' }],
          },
        ],
      },
    ],
  };
  const authorsPath = [
    { Field: 'users' },
    '@',
    { Field: 'reviews' },
    '@',
    { Field: 'author' },
  ] as const;
  return {
    kind: 'QueryPlan',
    node: {
      kind: 'Sequence',
      nodes: [
        {
          kind: 'Fetch',
          serviceName: 'a',
          operationKind: 'query',
          operation: '{users{__typename id name address{city}}}',
          id: 1,
          dependsOn: [],
        },
        {
          kind: 'Flatten',
          path: [{ Field: 'users' }, '@'],
          node: {
            kind: 'Fetch',
            serviceName: 'b',
            operationKind: 'query',
            operation:
              'query($representations:[_Any!]!){_entities(representations: $representations){...on User{reviews{author{__typename id}}}}}',
            requires: userRequires,
            id: 2,
            dependsOn: [1],
          },
        },
        authorsFetch === 'Fetch'
          ? {
              kind: 'Flatten',
              path: [...authorsPath],
              node: {
                kind: 'Fetch',
                serviceName: 'a',
                operationKind: 'query',
                operation:
                  'query($representations:[_Any!]!){_entities(representations: $representations){...on User{name address{city}}}}',
                requires: userRequires,
                id: 3,
                dependsOn: [1, 2],
                entityReuse,
              } as any,
            }
          : ({
              kind: 'BatchFetch',
              serviceName: 'a',
              operationKind: 'query',
              operation:
                'query($__batch_reps_0:[_Any!]!){_e0: _entities(representations: $__batch_reps_0){...on User{name address{city}}}}',
              entityBatch: {
                aliases: [
                  {
                    alias: '_e0',
                    representationsVariableName: '__batch_reps_0',
                    paths: [[...authorsPath]],
                    requires: userRequires,
                    entityReuse,
                  },
                ],
              },
              id: 3,
              dependsOn: [1, 2],
              completes: [3],
            } as any),
      ],
    },
    projection,
  };
}

function execute(
  queryPlan: QueryPlan,
  results: Record<string, (request: ExecutionRequest) => ExecutionResult>,
) {
  const requests: { subgraph: string; query: string; variables: any }[] = [];
  return {
    requests,
    result: executeQueryPlan({
      queryPlan,
      supergraphSchema,
      entityKeys: { a: { User: [['id']] }, b: { User: [['id']] } },
      possibleTypes: {},
      executionRequest: {
        document: parse(
          '{ users { id name reviews { author { id name address { city } } } } }',
        ),
      },
      onSubgraphExecute(subgraph, request) {
        requests.push({
          subgraph,
          query: print(request.document),
          variables: request.variables,
        });
        return results[subgraph]!(request);
      },
    }),
  };
}

const users = () => [
  { __typename: 'User', id: '1', name: 'Ann', address: { city: 'Oslo' } },
  { __typename: 'User', id: '2', name: 'Bob', address: { city: 'Rome' } },
];

function authorsOfReviews(...authorIds: string[][]) {
  return () => ({
    data: {
      _entities: authorIds.map((ids) => ({
        reviews: ids.map((id) => ({ author: { __typename: 'User', id } })),
      })),
    },
  });
}

it('copies the entities already in the response and sends only the others', async () => {
  const { result, requests } = execute(planAuthorsFromUsers(), {
    a: (request) =>
      request.variables?.['representations']
        ? {
            data: {
              _entities: request.variables['representations'].map(
                ({ id }: { id: string }) => ({
                  name: `fetched ${id}`,
                  address: { city: 'Lima' },
                }),
              ),
            },
          }
        : { data: { users: users() } },
    b: authorsOfReviews(['2', '3'], ['1']),
  });

  expect(await result).toEqual({
    data: {
      users: [
        {
          id: '1',
          name: 'Ann',
          reviews: [
            { author: { id: '2', name: 'Bob', address: { city: 'Rome' } } },
            {
              author: { id: '3', name: 'fetched 3', address: { city: 'Lima' } },
            },
          ],
        },
        {
          id: '2',
          name: 'Bob',
          reviews: [
            { author: { id: '1', name: 'Ann', address: { city: 'Oslo' } } },
          ],
        },
      ],
    },
  });
  // only the author that isn't one of the users is sent
  expect(requests[2]!.variables).toEqual({
    representations: [{ __typename: 'User', id: '3' }],
  });
});

it('sends no request when every entity is copied', async () => {
  const { result, requests } = execute(planAuthorsFromUsers(), {
    a: () => ({ data: { users: users() } }),
    b: authorsOfReviews(['2'], ['1', '2']),
  });

  expect(await result).toEqual({
    data: {
      users: [
        {
          id: '1',
          name: 'Ann',
          reviews: [
            { author: { id: '2', name: 'Bob', address: { city: 'Rome' } } },
          ],
        },
        {
          id: '2',
          name: 'Bob',
          reviews: [
            { author: { id: '1', name: 'Ann', address: { city: 'Oslo' } } },
            { author: { id: '2', name: 'Bob', address: { city: 'Rome' } } },
          ],
        },
      ],
    },
  });
  expect(requests.map(({ subgraph }) => subgraph)).toEqual(['a', 'b']);
});

it('gives every copy its own objects', async () => {
  const { result } = execute(planAuthorsFromUsers(), {
    a: () => ({ data: { users: users() } }),
    b: authorsOfReviews(['2', '2'], []),
  });

  const data = ((await result) as ExecutionResult).data as any;
  const [first, second] = data.users[0].reviews;
  expect(first.author.address).toEqual({ city: 'Rome' });
  expect(first.author.address).not.toBe(second.author.address);
  expect(first.author.address).not.toBe(data.users[1].address);
});

it('copies with a batch alias', async () => {
  const { result, requests } = execute(planAuthorsFromUsers('BatchFetch'), {
    a: (request) =>
      request.variables?.['__batch_reps_0']
        ? {
            data: {
              _e0: request.variables['__batch_reps_0'].map(
                ({ id }: { id: string }) => ({
                  name: `fetched ${id}`,
                  address: null,
                }),
              ),
            },
          }
        : { data: { users: users() } },
    b: authorsOfReviews(['2', '3'], ['1']),
  });

  const data = ((await result) as ExecutionResult).data as any;
  expect(data.users[0].reviews.map((review: any) => review.author)).toEqual([
    { id: '2', name: 'Bob', address: { city: 'Rome' } },
    { id: '3', name: 'fetched 3', address: null },
  ]);
  expect(data.users[1].reviews[0].author.name).toBe('Ann');
  expect(requests[2]!.variables).toEqual({
    __batch_reps_0: [{ __typename: 'User', id: '3' }],
  });
});

it('copies nothing once the request has an error', async () => {
  const { result, requests } = execute(planAuthorsFromUsers(), {
    a: (request) =>
      request.variables?.['representations']
        ? {
            data: {
              _entities: request.variables['representations'].map(() => ({
                name: 'fetched',
                address: null,
              })),
            },
          }
        : { data: { users: users() } },
    b: () => ({
      ...authorsOfReviews(['2'], ['1'])(),
      errors: [new GraphQLError('reviews failed', { path: ['_entities', 0] })],
    }),
  });

  await result;
  expect(requests[2]!.variables).toEqual({
    representations: [
      { __typename: 'User', id: '2' },
      { __typename: 'User', id: '1' },
    ],
  });
});

it('sends the entities whose source misses a copied field or has a null key', async () => {
  const { result, requests } = execute(planAuthorsFromUsers(), {
    a: (request) =>
      request.variables?.['representations']
        ? {
            data: {
              _entities: request.variables['representations'].map(() => ({
                name: 'fetched',
                address: null,
              })),
            },
          }
        : {
            data: {
              users: [
                // no `address`, nothing to copy it from
                { __typename: 'User', id: '1', name: 'Ann' },
                { __typename: 'User', id: '2', name: 'Bob', address: null },
              ],
            },
          },
    b: authorsOfReviews(['1', '2'], []),
  });

  const data = ((await result) as ExecutionResult).data as any;
  expect(data.users[0].reviews.map((review: any) => review.author)).toEqual([
    { id: '1', name: 'fetched', address: null },
    // a null is copied like any other value
    { id: '2', name: 'Bob', address: null },
  ]);
  expect(requests[2]!.variables).toEqual({
    representations: [{ __typename: 'User', id: '1' }],
  });
});
