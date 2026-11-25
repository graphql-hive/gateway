import type { QueryPlan } from '@graphql-hive/router-query-planner';
import {
  cloneRawExecutionResult,
  createRawExecutionResult,
} from '@graphql-tools/executor-common';
import type { ExecutionResult } from '@graphql-tools/utils';
import { buildSchema, parse } from 'graphql';
import { expect, it } from 'vitest';
import { executeQueryPlan } from '../src/executor';

const supergraphSchema = buildSchema(/* GraphQL */ `
  type Query {
    users: [User]
  }

  type User {
    id: ID!
    org: String
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
        operation: '{users{__typename id org}}',
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
            'query($representations:[_Any!]!){_entities(representations: $representations){...on User{name}}}',
          requires: [
            {
              kind: 'InlineFragment',
              typeCondition: 'User',
              selections: [
                { kind: 'Field', name: '__typename' },
                { kind: 'Field', name: 'id' },
                { kind: 'Field', name: 'org' },
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
        name: 'users',
        itemNonNull: [false],
        selections: [{ name: 'id', nonNull: true }, { name: 'name' }],
      },
    ],
  },
};

it.each([
  ['objects', false],
  ['the response tape', true],
])(
  'sends every distinct entity once and gives every duplicate its result, on %s',
  async (_, responseTape) => {
    const representations: unknown[] = [];
    const result = (await executeQueryPlan({
      responseTape,
      queryPlan,
      supergraphSchema,
      // only `id` is the key, `org` is sent as `null` when missing
      entityKeys: { b: { User: [['id']] } },
      possibleTypes: {},
      executionRequest: { document: parse('{ users { id name } }') },
      onSubgraphExecute(subgraph, request) {
        if (subgraph === 'a') {
          return {
            data: {
              users: [
                // the same values split differently, they must not pass for each other
                { __typename: 'User', id: 'xsy', org: 'z' },
                { __typename: 'User', id: 'x', org: 'ysz' },
                { __typename: 'User', id: 'xsy', org: 'z' },
                // without a key it isn't sent, also when seen again
                { __typename: 'User', org: 'y' },
                { __typename: 'User', org: 'y' },
                // a missing `org` and a `null` one are sent alike
                { __typename: 'User', id: '2' },
                { __typename: 'User', id: '2', org: null },
              ],
            },
          };
        }
        const sent = request.variables!['representations'] as {
          id: string;
          org: string | null;
        }[];
        representations.push(...sent);
        return {
          data: {
            _entities: sent.map(({ id, org }) => ({ name: `${id}/${org}` })),
          },
        };
      },
    })) as ExecutionResult;

    expect(representations).toEqual([
      { __typename: 'User', id: 'xsy', org: 'z' },
      { __typename: 'User', id: 'x', org: 'ysz' },
      { __typename: 'User', id: '2', org: null },
    ]);
    expect(result.data).toEqual({
      users: [
        { id: 'xsy', name: 'xsy/z' },
        { id: 'x', name: 'x/ysz' },
        { id: 'xsy', name: 'xsy/z' },
        null,
        null,
        { id: '2', name: '2/null' },
        { id: '2', name: '2/null' },
      ],
    });
  },
);

it('gives the response tape written response to the server as bytes, a string where made one', async () => {
  const result = (await executeQueryPlan({
    responseTape: true,
    queryPlan,
    supergraphSchema,
    entityKeys: { b: { User: [['id']] } },
    possibleTypes: {},
    executionRequest: { document: parse('{ users { id name } }') },
    onSubgraphExecute(subgraph) {
      return subgraph === 'a'
        ? { data: { users: [{ __typename: 'User', id: '1', org: 'é"' }] } }
        : { data: { _entities: [{ name: 'one' }] } };
    },
  })) as ExecutionResult & { stringify(r: ExecutionResult): unknown };
  const expected = { data: { users: [{ id: '1', name: 'one' }] } };
  const body = result.stringify(result);
  expect(body).toBeInstanceOf(Uint8Array);
  expect(
    JSON.parse(await new Response(body as Uint8Array<ArrayBuffer>).text()),
  ).toEqual(expected);
  // like Yoga joining a batch's responses
  expect(JSON.parse(`[${body}]`)).toEqual([expected]);
  // once `data` is read, it can be changed and the bytes no longer tell it
  expect(result.data).toEqual(expected.data);
  expect(typeof result.stringify(result)).toBe('string');
});

it('takes the last response written from the same shared bodies, and writes it from other ones', async () => {
  const encoder = new TextEncoder();
  const raw = (json: unknown) =>
    createRawExecutionResult(encoder.encode(JSON.stringify(json)), (bytes) =>
      JSON.parse(new TextDecoder().decode(bytes)),
    );
  const users = raw({ data: { users: [{ __typename: 'User', id: '1' }] } });
  const one = raw({ data: { _entities: [{ name: 'one' }] } });
  const two = raw({ data: { _entities: [{ name: 'two' }] } });
  const execute = (entities: ExecutionResult) =>
    executeQueryPlan({
      responseTape: true,
      queryPlan,
      supergraphSchema,
      entityKeys: { b: { User: [['id']] } },
      possibleTypes: {},
      executionRequest: { document: parse('{ users { id name } }') },
      // shared, like the consumers of a deduplicated request get them
      onSubgraphExecute: (subgraph) =>
        cloneRawExecutionResult(subgraph === 'a' ? users : entities),
    }) as Promise<ExecutionResult & { stringify(r: ExecutionResult): unknown }>;
  const send = (
    result: ExecutionResult & { stringify(r: ExecutionResult): unknown },
  ) => String(result.stringify(result));
  const bytes = async (entities: ExecutionResult) => {
    const result = await execute(entities);
    return result.stringify(result) as Uint8Array;
  };
  const first = send(await execute(one));
  expect(send(await execute(one))).toBe(first);
  // the very bytes written before
  expect((await bytes(one)).buffer).toBe((await bytes(one)).buffer);
  expect((await bytes(two)).buffer).not.toBe((await bytes(one)).buffer);
  expect(JSON.parse(first)).toEqual({
    data: { users: [{ id: '1', name: 'one' }] },
  });
  expect(JSON.parse(send(await execute(two)))).toEqual({
    data: { users: [{ id: '1', name: 'two' }] },
  });
});
