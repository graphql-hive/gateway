import type {
  FlattenNodePathSegment,
  PlanNode,
  QueryPlan,
} from '@graphql-hive/router-query-planner';
import type { ExecutionResult } from '@graphql-tools/utils';
import { buildSchema, GraphQLError, parse, print } from 'graphql';
import { describe, expect, it } from 'vitest';
import { executeQueryPlan } from '../src/executor';

// the query plans are produced by the hive router query planner for the
// supergraph behind this schema, `Transaction.amount` reads its `code`
// argument from the `currency` of the nearest `User` with `@fromContext`.
// the installed planner types dont know about the context fields yet, hence
// the plan node casts

const supergraphSchema = buildSchema(/* GraphQL */ `
  type Query {
    users: [User]
    secondUsers: [User]
    account: Account
    viewer: Viewer
  }

  type User implements Account {
    id: ID!
    currency: String
    child: User
    wrapper: Wrapper
    txs: [Transaction]
  }

  type Other implements Account {
    currency: String
    txs: [Transaction]
  }

  type Wrapper {
    txs: [Transaction]
  }

  type Transaction {
    id: ID!
    amount(multiplier: Int): Int
    fromInterface: Int
    fromUnion: Int
  }

  interface Account {
    currency: String
    txs: [Transaction]
  }

  union Viewer = User | Other
`);

const transactionRequires = [
  {
    kind: 'InlineFragment' as const,
    typeCondition: 'Transaction',
    selections: [
      { kind: 'Field' as const, name: '__typename' },
      { kind: 'Field' as const, name: 'id' },
    ],
  },
];

const usersTxsPath: FlattenNodePathSegment[] = [
  { Field: 'users' },
  '@',
  { Field: 'txs' },
  '@',
];

function flattenPlan(
  rootOperation: string,
  path: FlattenNodePathSegment[],
  fetch: Record<string, unknown>,
): QueryPlan {
  return {
    kind: 'QueryPlan',
    node: {
      kind: 'Sequence',
      nodes: [
        {
          kind: 'Fetch',
          serviceName: 'a',
          operationKind: 'query',
          operation: rootOperation,
        },
        {
          kind: 'Flatten',
          path,
          node: {
            kind: 'Fetch',
            serviceName: 'a',
            operationKind: 'query',
            requires: transactionRequires,
            ...fetch,
          } as unknown as PlanNode,
        },
      ],
    },
  };
}

const usersTxsAmountPlan = flattenPlan(
  '{users{__typename currency txs{__typename id}}}',
  usersTxsPath,
  {
    variableUsages: ['__context_0'],
    operation:
      'query($representations:[_Any!]!, $__context_0:String){_entities(representations: $representations){...on Transaction{amount(code: $__context_0)}}}',
    contextVariables: ['__context_0'],
    contextRewrites: [
      {
        path: ['Parent', { TypenameEquals: ['User'] }, { Key: 'currency' }],
        renameKeyTo: '__context_0',
      },
    ],
  },
);

function usersWithCurrencies(currencies: (string | null)[], txs = 1) {
  return currencies.map((currency) => ({
    __typename: 'User',
    currency,
    txs: Array.from({ length: txs }, () => ({
      __typename: 'Transaction',
      id: 'same',
    })),
  }));
}

interface SubgraphRequest {
  query: string;
  variables: Record<string, unknown> | undefined;
}

async function execute(
  queryPlan: QueryPlan,
  query: string,
  respond: (request: SubgraphRequest) => ExecutionResult,
  variables?: Record<string, unknown>,
) {
  const requests: SubgraphRequest[] = [];
  const result = (await executeQueryPlan({
    queryPlan,
    supergraphSchema,
    executionRequest: { document: parse(query), variables },
    onSubgraphExecute(_subgraphName, executionRequest) {
      const request = {
        query: print(executionRequest.document),
        variables: executionRequest.variables,
      };
      requests.push(request);
      return respond(request);
    },
  })) as ExecutionResult;
  return { result, requests };
}

describe('@fromContext', () => {
  it('sends the original operation when all entities share the context values', async () => {
    const { result, requests } = await execute(
      usersTxsAmountPlan,
      '{ users { txs { amount } } }',
      ({ query }) =>
        query.includes('_entities')
          ? { data: { _entities: [{ amount: 1 }] } }
          : { data: { users: usersWithCurrencies(['USD', 'USD'], 2) } },
    );

    expect(requests[1]).toEqual({
      query: print(
        parse(
          'query($representations:[_Any!]!, $__context_0:String){_entities(representations: $representations){...on Transaction{amount(code: $__context_0)}}}',
        ),
      ),
      variables: {
        __context_0: 'USD',
        representations: [{ __typename: 'Transaction', id: 'same' }],
      },
    });
    expect(result).toEqual({
      data: {
        users: [
          { txs: [{ amount: 1 }, { amount: 1 }] },
          { txs: [{ amount: 1 }, { amount: 1 }] },
        ],
      },
    });
  });

  it('sends every context group as an aliased field in one request', async () => {
    const { result, requests } = await execute(
      usersTxsAmountPlan,
      '{ users { txs { amount } } }',
      ({ query }) =>
        query.includes('_entities')
          ? {
              // the order of the aliases in the response doesn't matter
              data: {
                _entities_2: [{ amount: 0 }],
                _entities_1: [{ amount: 2 }],
                _entities_0: [{ amount: 1 }],
              },
            }
          : { data: { users: usersWithCurrencies(['USD', 'EUR', null], 2) } },
    );

    expect(requests).toHaveLength(2);
    expect(requests[1]!.query).toMatchInlineSnapshot(`
      "query ($representations_0: [_Any!]!, $__context_0_0: String, $representations_1: [_Any!]!, $__context_0_1: String, $representations_2: [_Any!]!, $__context_0_2: String) {
        _entities_0: _entities(representations: $representations_0) {
          ... on Transaction {
            amount(code: $__context_0_0)
          }
        }
        _entities_1: _entities(representations: $representations_1) {
          ... on Transaction {
            amount(code: $__context_0_1)
          }
        }
        _entities_2: _entities(representations: $representations_2) {
          ... on Transaction {
            amount(code: $__context_0_2)
          }
        }
      }"
    `);
    const representations = [{ __typename: 'Transaction', id: 'same' }];
    expect(requests[1]!.variables).toEqual({
      __context_0_0: 'USD',
      representations_0: representations,
      __context_0_1: 'EUR',
      representations_1: representations,
      __context_0_2: null,
      representations_2: representations,
    });
    expect(result).toEqual({
      data: {
        users: [
          { txs: [{ amount: 1 }, { amount: 1 }] },
          { txs: [{ amount: 2 }, { amount: 2 }] },
          { txs: [{ amount: 0 }, { amount: 0 }] },
        ],
      },
    });
  });

  it('shares client variables between the aliased fields', async () => {
    const { result, requests } = await execute(
      flattenPlan(
        '{users{__typename currency txs{__typename id}}}',
        usersTxsPath,
        {
          variableUsages: ['__context_0', 'm'],
          operation:
            'query($representations:[_Any!]!, $m:Int, $__context_0:String){_entities(representations: $representations){...on Transaction{amount(code: $__context_0, multiplier: $m)}}}',
          contextVariables: ['__context_0'],
          contextRewrites: [
            {
              path: [
                'Parent',
                { TypenameEquals: ['User'] },
                { Key: 'currency' },
              ],
              renameKeyTo: '__context_0',
            },
          ],
        },
      ),
      'query ($m: Int) { users { txs { amount(multiplier: $m) } } }',
      ({ query }) =>
        query.includes('_entities')
          ? {
              data: {
                _entities_0: [{ amount: 10 }],
                _entities_1: [{ amount: 20 }],
              },
            }
          : { data: { users: usersWithCurrencies(['USD', 'EUR']) } },
      { m: 10 },
    );

    expect(requests[1]!.query).toMatchInlineSnapshot(`
      "query ($m: Int, $representations_0: [_Any!]!, $__context_0_0: String, $representations_1: [_Any!]!, $__context_0_1: String) {
        _entities_0: _entities(representations: $representations_0) {
          ... on Transaction {
            amount(code: $__context_0_0, multiplier: $m)
          }
        }
        _entities_1: _entities(representations: $representations_1) {
          ... on Transaction {
            amount(code: $__context_0_1, multiplier: $m)
          }
        }
      }"
    `);
    expect(requests[1]!.variables).toEqual({
      m: 10,
      __context_0_0: 'USD',
      representations_0: [{ __typename: 'Transaction', id: 'same' }],
      __context_0_1: 'EUR',
      representations_1: [{ __typename: 'Transaction', id: 'same' }],
    });
    expect(result).toEqual({
      data: {
        users: [{ txs: [{ amount: 10 }] }, { txs: [{ amount: 20 }] }],
      },
    });
  });

  it('renames the fragments of every aliased field', async () => {
    const { result, requests } = await execute(
      flattenPlan(
        '{users{__typename currency txs{__typename id}}}',
        usersTxsPath,
        {
          variableUsages: ['__context_0'],
          operation:
            'query($representations:[_Any!]!, $__context_0:String){_entities(representations: $representations){...a}}\n\nfragment a on Transaction {amount(code: $__context_0)}\n',
          contextVariables: ['__context_0'],
          contextRewrites: [
            {
              path: [
                'Parent',
                { TypenameEquals: ['User'] },
                { Key: 'currency' },
              ],
              renameKeyTo: '__context_0',
            },
          ],
        },
      ),
      '{ users { txs { amount } } }',
      ({ query }) =>
        query.includes('_entities')
          ? {
              data: {
                _entities_0: [{ amount: 1 }],
                _entities_1: [{ amount: 2 }],
              },
            }
          : { data: { users: usersWithCurrencies(['USD', 'EUR']) } },
    );

    expect(requests[1]!.query).toMatchInlineSnapshot(`
      "query ($representations_0: [_Any!]!, $__context_0_0: String, $representations_1: [_Any!]!, $__context_0_1: String) {
        _entities_0: _entities(representations: $representations_0) {
          ...a_0
        }
        _entities_1: _entities(representations: $representations_1) {
          ...a_1
        }
      }

      fragment a_0 on Transaction {
        amount(code: $__context_0_0)
      }

      fragment a_1 on Transaction {
        amount(code: $__context_0_1)
      }"
    `);
    expect(result).toEqual({
      data: {
        users: [{ txs: [{ amount: 1 }] }, { txs: [{ amount: 2 }] }],
      },
    });
  });

  it('fetches context groups one by one when a context variable is non-null', async () => {
    const operation =
      'query($representations:[_Any!]!, $__context_0:String!){_entities(representations: $representations){...on Transaction{amount(code: $__context_0)}}}';
    const { result, requests } = await execute(
      flattenPlan(
        '{users{__typename currency txs{__typename id}}}',
        usersTxsPath,
        {
          variableUsages: ['__context_0'],
          operation,
          contextVariables: ['__context_0'],
          contextRewrites: [
            {
              path: [
                'Parent',
                { TypenameEquals: ['User'] },
                { Key: 'currency' },
              ],
              renameKeyTo: '__context_0',
            },
          ],
        },
      ),
      '{ users { txs { amount } } }',
      ({ query, variables }) =>
        query.includes('_entities')
          ? {
              data: {
                _entities: [
                  { amount: variables!['__context_0'] === 'USD' ? 1 : 2 },
                ],
              },
            }
          : { data: { users: usersWithCurrencies(['USD', 'EUR']) } },
    );

    expect(requests.slice(1)).toEqual([
      {
        query: print(parse(operation)),
        variables: {
          __context_0: 'USD',
          representations: [{ __typename: 'Transaction', id: 'same' }],
        },
      },
      {
        query: print(parse(operation)),
        variables: {
          __context_0: 'EUR',
          representations: [{ __typename: 'Transaction', id: 'same' }],
        },
      },
    ]);
    expect(result).toEqual({
      data: {
        users: [{ txs: [{ amount: 1 }] }, { txs: [{ amount: 2 }] }],
      },
    });
  });

  it('reads context values through ancestors that do not set the context', async () => {
    const { result, requests } = await execute(
      flattenPlan(
        '{users{__typename currency wrapper{txs{__typename id}}}}',
        [{ Field: 'users' }, '@', { Field: 'wrapper' }, { Field: 'txs' }, '@'],
        {
          variableUsages: ['__context_0'],
          operation:
            'query($representations:[_Any!]!, $__context_0:String){_entities(representations: $representations){...on Transaction{amount(code: $__context_0)}}}',
          contextVariables: ['__context_0'],
          contextRewrites: [
            {
              path: [
                'Parent',
                'Parent',
                { TypenameEquals: ['User'] },
                { Key: 'currency' },
              ],
              renameKeyTo: '__context_0',
            },
          ],
        },
      ),
      '{ users { wrapper { txs { amount } } } }',
      ({ query }) =>
        query.includes('_entities')
          ? { data: { _entities: [{ amount: 1 }] } }
          : {
              data: {
                users: [
                  {
                    __typename: 'User',
                    currency: 'USD',
                    wrapper: {
                      txs: [{ __typename: 'Transaction', id: '1' }],
                    },
                  },
                ],
              },
            },
    );

    expect(requests[1]!.variables).toEqual({
      __context_0: 'USD',
      representations: [{ __typename: 'Transaction', id: '1' }],
    });
    expect(result).toEqual({
      data: { users: [{ wrapper: { txs: [{ amount: 1 }] } }] },
    });
  });

  it('reads context values from an interface ancestor', async () => {
    const { result, requests } = await execute(
      flattenPlan(
        '{account{__typename currency txs{__typename id}}}',
        [{ Field: 'account' }, { Field: 'txs' }, '@'],
        {
          variableUsages: ['__context_0'],
          operation:
            'query($representations:[_Any!]!, $__context_0:String){_entities(representations: $representations){...on Transaction{fromInterface(code: $__context_0)}}}',
          contextVariables: ['__context_0'],
          contextRewrites: [
            {
              path: [
                'Parent',
                { TypenameEquals: ['Account'] },
                { Key: 'currency' },
              ],
              renameKeyTo: '__context_0',
            },
          ],
        },
      ),
      '{ account { txs { fromInterface } } }',
      ({ query }) =>
        query.includes('_entities')
          ? { data: { _entities: [{ fromInterface: 1 }] } }
          : {
              data: {
                account: {
                  __typename: 'Other',
                  currency: 'EUR',
                  txs: [{ __typename: 'Transaction', id: '1' }],
                },
              },
            },
    );

    expect(requests[1]!.variables).toEqual({
      __context_0: 'EUR',
      representations: [{ __typename: 'Transaction', id: '1' }],
    });
    expect(result).toEqual({
      data: { account: { txs: [{ fromInterface: 1 }] } },
    });
  });

  it('sends null when the context value cannot be read', async () => {
    const { requests } = await execute(
      usersTxsAmountPlan,
      '{ users { txs { amount } } }',
      ({ query }) =>
        query.includes('_entities')
          ? { data: { _entities: [{ amount: 1 }] } }
          : {
              data: {
                users: [
                  {
                    // not a User, so the type condition of the rewrite doesn't match
                    __typename: 'Other',
                    currency: 'USD',
                    txs: [{ __typename: 'Transaction', id: '1' }],
                  },
                ],
              },
            },
    );

    expect(requests[1]!.variables).toEqual({
      __context_0: null,
      representations: [{ __typename: 'Transaction', id: '1' }],
    });
  });

  it('relocates errors of aliased fields to the entities of their group', async () => {
    const { result } = await execute(
      usersTxsAmountPlan,
      '{ users { txs { amount } } }',
      ({ query }) =>
        query.includes('_entities')
          ? {
              data: {
                _entities_0: [{ amount: 1 }],
                _entities_1: [{ amount: null }],
                _entities_2: null,
              },
              errors: [
                new GraphQLError('Amount failed', {
                  path: ['_entities_1', 0, 'amount'],
                }),
                new GraphQLError('Entities failed', {
                  path: ['_entities_2'],
                }),
              ],
            }
          : {
              data: {
                users: usersWithCurrencies(['USD', 'EUR', 'GBP'], 2),
              },
            },
    );

    expect(result.data).toEqual({
      users: [
        { txs: [{ amount: 1 }, { amount: 1 }] },
        { txs: [{ amount: null }, { amount: null }] },
        { txs: [{ amount: null }, { amount: null }] },
      ],
    });
    expect(
      result.errors?.map((error) => ({
        message: error.message,
        path: error.path,
      })),
    ).toEqual([
      { message: 'Amount failed', path: ['users', 1, 'txs', 0, 'amount'] },
      { message: 'Amount failed', path: ['users', 1, 'txs', 1, 'amount'] },
      { message: 'Entities failed', path: ['users', 2, 'txs', 0] },
      { message: 'Entities failed', path: ['users', 2, 'txs', 1] },
    ]);
  });

  describe('BatchFetch', () => {
    const batchPlan: QueryPlan = {
      kind: 'QueryPlan',
      node: {
        kind: 'Sequence',
        nodes: [
          {
            kind: 'Fetch',
            serviceName: 'a',
            operationKind: 'query',
            operation:
              '{users{...a} secondUsers{...a}}\n\nfragment a on User {__typename currency txs{__typename id}}\n',
          },
          {
            kind: 'BatchFetch',
            serviceName: 'a',
            variableUsages: ['__context_0', '__context_1'],
            operationKind: 'query',
            operation:
              'query($__batch_reps_0:[_Any!]!, $__batch_reps_1:[_Any!]!, $__context_1:String, $__context_0:String){_e0: _entities(representations: $__batch_reps_0){...on Transaction{amount(code: $__context_1)}} _e1: _entities(representations: $__batch_reps_1){...on Transaction{amount(code: $__context_0)}}}',
            entityBatch: {
              aliases: [
                {
                  alias: '_e0',
                  representationsVariableName: '__batch_reps_0',
                  paths: [
                    [{ Field: 'secondUsers' }, '@', { Field: 'txs' }, '@'],
                  ],
                  requires: transactionRequires,
                  contextVariables: ['__context_1'],
                  contextRewrites: [
                    {
                      path: [
                        'Parent',
                        { TypenameEquals: ['User'] },
                        { Key: 'currency' },
                      ],
                      renameKeyTo: '__context_1',
                    },
                  ],
                },
                {
                  alias: '_e1',
                  representationsVariableName: '__batch_reps_1',
                  paths: [usersTxsPath],
                  requires: transactionRequires,
                  contextVariables: ['__context_0'],
                  contextRewrites: [
                    {
                      path: [
                        'Parent',
                        { TypenameEquals: ['User'] },
                        { Key: 'currency' },
                      ],
                      renameKeyTo: '__context_0',
                    },
                  ],
                },
              ],
            },
          } as unknown as PlanNode,
        ],
      },
    };

    it('sends one wave with the original operation', async () => {
      const { result, requests } = await execute(
        batchPlan,
        '{ users { txs { amount } } secondUsers { txs { amount } } }',
        ({ query }) =>
          query.includes('_entities')
            ? { data: { _e0: [{ amount: 2 }], _e1: [{ amount: 1 }] } }
            : {
                data: {
                  users: usersWithCurrencies(['USD']),
                  secondUsers: usersWithCurrencies(['EUR']),
                },
              },
      );

      expect(requests[1]!.variables).toEqual({
        __context_0: 'USD',
        __context_1: 'EUR',
        __batch_reps_0: [{ __typename: 'Transaction', id: 'same' }],
        __batch_reps_1: [{ __typename: 'Transaction', id: 'same' }],
      });
      expect(result).toEqual({
        data: {
          users: [{ txs: [{ amount: 1 }] }],
          secondUsers: [{ txs: [{ amount: 2 }] }],
        },
      });
    });

    it('sends aliases with unequal group counts in one aliased request', async () => {
      const { result, requests } = await execute(
        batchPlan,
        '{ users { txs { amount } } secondUsers { txs { amount } } }',
        ({ query }) =>
          query.includes('_entities')
            ? {
                data: {
                  _e0_0: [{ amount: 3 }],
                  _e1_0: [{ amount: 1 }],
                  _e0_1: [],
                  _e1_1: [{ amount: 2 }],
                },
              }
            : {
                data: {
                  users: usersWithCurrencies(['USD', 'EUR']),
                  secondUsers: usersWithCurrencies(['GBP']),
                },
              },
      );

      expect(requests).toHaveLength(2);
      expect(requests[1]!.query).toMatchInlineSnapshot(`
        "query ($__batch_reps_0_0: [_Any!]!, $__batch_reps_1_0: [_Any!]!, $__context_1_0: String, $__context_0_0: String, $__batch_reps_0_1: [_Any!]!, $__batch_reps_1_1: [_Any!]!, $__context_1_1: String, $__context_0_1: String) {
          _e0_0: _entities(representations: $__batch_reps_0_0) {
            ... on Transaction {
              amount(code: $__context_1_0)
            }
          }
          _e1_0: _entities(representations: $__batch_reps_1_0) {
            ... on Transaction {
              amount(code: $__context_0_0)
            }
          }
          _e0_1: _entities(representations: $__batch_reps_0_1) {
            ... on Transaction {
              amount(code: $__context_1_1)
            }
          }
          _e1_1: _entities(representations: $__batch_reps_1_1) {
            ... on Transaction {
              amount(code: $__context_0_1)
            }
          }
        }"
      `);
      const representations = [{ __typename: 'Transaction', id: 'same' }];
      expect(requests[1]!.variables).toEqual({
        __context_1_0: 'GBP',
        __batch_reps_0_0: representations,
        __context_0_0: 'USD',
        __batch_reps_1_0: representations,
        // secondUsers has a single group, so it repeats its values and sends nothing
        __context_1_1: 'GBP',
        __batch_reps_0_1: [],
        __context_0_1: 'EUR',
        __batch_reps_1_1: representations,
      });
      expect(result).toEqual({
        data: {
          users: [{ txs: [{ amount: 1 }] }, { txs: [{ amount: 2 }] }],
          secondUsers: [{ txs: [{ amount: 3 }] }],
        },
      });
    });

    it('sends null context values and empty representations for an alias without entities', async () => {
      const { result, requests } = await execute(
        batchPlan,
        '{ users { txs { amount } } secondUsers { txs { amount } } }',
        ({ query }) =>
          query.includes('_entities')
            ? {
                data: {
                  _e1_0: [{ amount: 1 }],
                  _e1_1: [{ amount: 2 }],
                },
              }
            : {
                data: {
                  users: usersWithCurrencies(['USD', 'EUR']),
                  secondUsers: [],
                },
              },
      );

      expect(requests[1]!.variables).toEqual({
        __context_1_0: null,
        __batch_reps_0_0: [],
        __context_0_0: 'USD',
        __batch_reps_1_0: [{ __typename: 'Transaction', id: 'same' }],
        __context_1_1: null,
        __batch_reps_0_1: [],
        __context_0_1: 'EUR',
        __batch_reps_1_1: [{ __typename: 'Transaction', id: 'same' }],
      });
      expect(result).toEqual({
        data: {
          users: [{ txs: [{ amount: 1 }] }, { txs: [{ amount: 2 }] }],
          secondUsers: [],
        },
      });
    });

    it('relocates errors of aliased fields to the entities of their wave', async () => {
      const { result } = await execute(
        batchPlan,
        '{ users { txs { amount } } secondUsers { txs { amount } } }',
        ({ query }) =>
          query.includes('_entities')
            ? {
                data: {
                  _e0_0: [{ amount: 3 }],
                  _e1_0: [{ amount: 1 }],
                  _e0_1: [],
                  _e1_1: [{ amount: null }],
                },
                errors: [
                  new GraphQLError('Amount failed', {
                    path: ['_e1_1', 0, 'amount'],
                  }),
                ],
              }
            : {
                data: {
                  users: usersWithCurrencies(['USD', 'EUR']),
                  secondUsers: usersWithCurrencies(['GBP']),
                },
              },
      );

      expect(
        result.errors?.map((error) => ({
          message: error.message,
          path: error.path,
        })),
      ).toEqual([
        { message: 'Amount failed', path: ['users', 1, 'txs', 0, 'amount'] },
      ]);
    });

    it('reads context values from the ancestor matching a union member', async () => {
      const { result, requests } = await execute(
        {
          kind: 'QueryPlan',
          node: {
            kind: 'Sequence',
            nodes: [
              {
                kind: 'Fetch',
                serviceName: 'a',
                operationKind: 'query',
                operation:
                  '{viewer{__typename ...on User{__typename currency txs{...a}} ...on Other{__typename currency txs{...a}}}}\n\nfragment a on Transaction {__typename id}\n',
              },
              {
                kind: 'BatchFetch',
                serviceName: 'a',
                variableUsages: ['__context_0', '__context_1'],
                operationKind: 'query',
                operation:
                  'query($__batch_reps_0:[_Any!]!, $__batch_reps_1:[_Any!]!, $__context_1:String, $__context_0:String){_e0: _entities(representations: $__batch_reps_0){...on Transaction{fromUnion(code: $__context_1)}} _e1: _entities(representations: $__batch_reps_1){...on Transaction{fromUnion(code: $__context_0)}}}',
                entityBatch: {
                  aliases: (
                    [
                      ['_e0', '__batch_reps_0', 'Other', '__context_1'],
                      ['_e1', '__batch_reps_1', 'User', '__context_0'],
                    ] as const
                  ).map(([alias, variable, type, context]) => ({
                    alias,
                    representationsVariableName: variable,
                    paths: [
                      [
                        { Field: 'viewer' },
                        { TypeCondition: [type] },
                        { Field: 'txs' },
                        '@',
                      ],
                    ],
                    requires: transactionRequires,
                    contextVariables: [context],
                    contextRewrites: ['User', 'Other'].map((member) => ({
                      path: [
                        'Parent',
                        { TypenameEquals: [member] },
                        { Key: 'currency' },
                      ],
                      renameKeyTo: context,
                    })),
                  })),
                },
              } as unknown as PlanNode,
            ],
          },
        },
        '{ viewer { ... on User { txs { fromUnion } } ... on Other { txs { fromUnion } } } }',
        ({ query }) =>
          query.includes('_entities')
            ? { data: { _e0: [{ fromUnion: 1 }], _e1: [] } }
            : {
                data: {
                  viewer: {
                    __typename: 'Other',
                    currency: 'EUR',
                    txs: [{ __typename: 'Transaction', id: '1' }],
                  },
                },
              },
      );

      expect(requests[1]!.variables).toEqual({
        __context_1: 'EUR',
        __batch_reps_0: [{ __typename: 'Transaction', id: '1' }],
        __context_0: null,
        __batch_reps_1: [],
      });
      expect(result).toEqual({
        data: { viewer: { txs: [{ fromUnion: 1 }] } },
      });
    });
  });
});
