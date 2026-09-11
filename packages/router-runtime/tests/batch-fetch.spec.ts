import { createGatewayTester } from '@graphql-hive/gateway-testing';
import type { ExecutionResult } from '@graphql-tools/utils';
import { expect, it } from 'vitest';
import { unifiedGraphHandler, useQueryPlan } from '../src/index';

// Regression test for the `BatchFetch` empty-representations bug.
//
// The planner groups entity fetches for the *same* subgraph into a single
// `BatchFetch` node. Each grouped field becomes its own aliased `_entities`
// call with its own required `$representations: [_Any!]!` variable, e.g.:
//
//   query($__batch_reps_0: [_Any!]!, $__batch_reps_1: [_Any!]!) {
//     _e0: _entities(representations: $__batch_reps_0) { ... on User { name } }
//     _e1: _entities(representations: $__batch_reps_1) { ... on Cover { url } }
//   }
//
// When one grouped field is a *nullable* entity reference that resolved to
// `null` (here `cover`), its representations list is empty.
// `buildBatchFetchVariables` used to skip attaching that variable entirely —
// while the operation still declared it as required. The subgraph then rejected
// the whole operation ("Variable $__batch_reps_1 ... was not provided"), so the
// sibling alias that *did* have representations (`watchers`) came back `null`.
//
// Note the two grouped fields must be *different* entity types (`Cover` vs
// `User`); same-typed fields get merged into a single alias by the planner and
// never surface the empty-alias case.

it('hydrates sibling entities when a grouped BatchFetch alias has empty representations', async () => {
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    plugins: () => [useQueryPlan({ expose: true })],
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
                // nullable reference resolves to null -> empty representations alias
                cover: null,
                // required list still needs hydration from the `assets` subgraph
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

  const result = (await gw.execute({
    query: /* GraphQL */ `
      {
        ticket {
          id
          cover {
            url
          }
          watchers {
            name
          }
        }
      }
    `,
  })) as ExecutionResult;

  // Guard: the plan must actually group both `assets` fetches into one
  // BatchFetch with two aliased `_entities` variables — otherwise this test
  // would silently stop exercising the empty-alias path.
  const plan = JSON.stringify(result.extensions?.queryPlan);
  expect(plan).toContain('"kind":"BatchFetch"');
  expect(plan).toContain('__batch_reps_0');
  expect(plan).toContain('__batch_reps_1');

  // Pre-fix, the empty `cover` alias made the subgraph reject the whole batch
  // ("Variable $__batch_reps_1 ... was not provided") and `watchers` came back
  // `[null, null]`. The required watchers must hydrate and the null cover must
  // stay null without erroring.
  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    ticket: {
      id: 't1',
      cover: null,
      watchers: [{ name: 'user-u1' }, { name: 'user-u2' }],
    },
  });
});
