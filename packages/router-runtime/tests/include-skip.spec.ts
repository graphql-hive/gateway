import { createGatewayTester } from '@graphql-hive/gateway-testing';
import type { OnSubgraphExecutePayload } from '@graphql-mesh/fusion-runtime';
import type { ExecutionResult } from '@graphql-tools/utils';
import { describe, expect, it } from 'vitest';
import { unifiedGraphHandler, useQueryPlan } from '../src/index';

// the query planner puts the `@include`/`@skip` around a fetch and on its fields into the
// fetch's `runIf`, and into `runIf` of every batch alias, these tests make sure the executor
// honors it

function createGateway() {
  const requests: { subgraphName: string; variables: any }[] = [];
  const gw = createGatewayTester({
    unifiedGraphHandler,
    plugins: () => [
      useQueryPlan({ expose: true }),
      {
        onSubgraphExecute({
          subgraphName,
          executionRequest,
        }: OnSubgraphExecutePayload<unknown>) {
          requests.push({
            subgraphName,
            variables: executionRequest.variables,
          });
        },
      },
    ],
    subgraphs: [
      {
        name: 'tickets',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              ticket: Ticket
            }

            type Ticket @key(fields: "id") {
              id: ID!
              cover: Cover
              watchers: [User!]!
            }

            type Cover @key(fields: "id") {
              id: ID!
            }

            type User @key(fields: "id") {
              id: ID!
            }
          `,
          resolvers: {
            Query: {
              ticket: () => ({
                id: 't1',
                cover: { id: 'c1' },
                watchers: [{ id: 'u1' }, { id: 'u2' }],
              }),
            },
          },
        },
      },
      {
        name: 'assets',
        schema: {
          typeDefs: /* GraphQL */ `
            type Ticket @key(fields: "id") {
              id: ID!
              title: String
              priority: Int
            }

            type Cover @key(fields: "id") {
              id: ID!
              url: String!
            }

            type User @key(fields: "id") {
              id: ID!
              name: String!
            }
          `,
          resolvers: {
            Ticket: {
              __resolveReference: (ref: { id: string }) => ({
                id: ref.id,
                title: `title-${ref.id}`,
                priority: 1,
              }),
            },
            Cover: {
              __resolveReference: (ref: { id: string }) => ({
                id: ref.id,
                url: `cover-${ref.id}`,
              }),
            },
            User: {
              __resolveReference: (ref: { id: string }) => ({
                id: ref.id,
                name: `user-${ref.id}`,
              }),
            },
          },
        },
      },
    ],
  });
  return { gw, requests };
}

describe('fetch runIf', () => {
  const query = /* GraphQL */ `
    query ($a: Boolean!, $b: Boolean!) {
      ticket {
        id
        title @include(if: $a)
        priority @include(if: $b)
      }
    }
  `;

  it('does not send an entity fetch whose fields are all skipped', async () => {
    const { gw, requests } = createGateway();
    await using _ = gw;

    const result = (await gw.execute({
      query,
      variables: { a: false, b: false },
    })) as ExecutionResult;

    // guard: the entity fetch must actually have a runIf
    expect(JSON.stringify(result.extensions?.queryPlan)).toContain('"runIf"');

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ ticket: { id: 't1' } });
    expect(requests.map((r) => r.subgraphName)).toEqual(['tickets']);
  });

  it('sends an entity fetch when any of its fields is included', async () => {
    const { gw, requests } = createGateway();
    await using _ = gw;

    const result = (await gw.execute({
      query,
      variables: { a: false, b: true },
    })) as ExecutionResult;

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ ticket: { id: 't1', priority: 1 } });
    expect(requests.map((r) => r.subgraphName)).toEqual(['tickets', 'assets']);
  });

  it('does not send a skipped root fetch and responds with empty data', async () => {
    const { gw, requests } = createGateway();
    await using _ = gw;

    const result = (await gw.execute({
      query: /* GraphQL */ `
        query ($a: Boolean!) {
          ticket @include(if: $a) {
            id
          }
        }
      `,
      variables: { a: false },
    })) as ExecutionResult;

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({});
    expect(requests).toEqual([]);
  });

  it('responds with empty data when the plan has no node', async () => {
    const { gw, requests } = createGateway();
    await using _ = gw;

    for (const a of [true, false]) {
      const result = (await gw.execute({
        query: /* GraphQL */ `
          query ($a: Boolean!) {
            ticket @skip(if: $a) @include(if: $a) {
              id
            }
          }
        `,
        variables: { a },
      })) as ExecutionResult;

      // guard: no fetch can ever run, so the planner leaves the node out
      expect(result.extensions?.queryPlan).not.toHaveProperty('node');

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({});
    }
    expect(requests).toEqual([]);
  });
});

describe('batch alias runIf', () => {
  const query = /* GraphQL */ `
    query ($a: Boolean!, $b: Boolean!) {
      ticket {
        cover {
          url @include(if: $a)
        }
        watchers {
          name @skip(if: $b)
        }
      }
    }
  `;

  it('sends no representations for an alias that is off', async () => {
    const { gw, requests } = createGateway();
    await using _ = gw;

    const result = (await gw.execute({
      query,
      variables: { a: false, b: false },
    })) as ExecutionResult;

    // guard: both entity fetches must be batched, with a runIf on each alias
    const plan = JSON.stringify(result.extensions?.queryPlan);
    expect(plan).toContain('"kind":"BatchFetch"');
    expect(plan.match(/"runIf"/g)).toHaveLength(2);

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      ticket: {
        cover: {},
        watchers: [{ name: 'user-u1' }, { name: 'user-u2' }],
      },
    });
    const assets = requests.filter((r) => r.subgraphName === 'assets');
    expect(assets).toHaveLength(1);
    expect(Object.values(assets[0]!.variables)).toEqual(
      expect.arrayContaining([
        [],
        [
          { __typename: 'User', id: 'u1' },
          { __typename: 'User', id: 'u2' },
        ],
      ]),
    );
  });

  it('does not send the batch when every alias is off', async () => {
    const { gw, requests } = createGateway();
    await using _ = gw;

    const result = (await gw.execute({
      query,
      variables: { a: false, b: true },
    })) as ExecutionResult;

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      ticket: {
        cover: {},
        watchers: [{}, {}],
      },
    });
    expect(requests.map((r) => r.subgraphName)).toEqual(['tickets']);
  });
});
