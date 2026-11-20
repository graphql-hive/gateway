import { createRequire } from 'node:module';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { createGatewayTester } from '@graphql-hive/gateway-testing';
import type { ExecutionResult } from '@graphql-tools/utils';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { expect, it } from 'vitest';
import { unifiedGraphHandler, useQueryPlan } from '../src/index';

// __filename instead of import.meta.url, jest runs the tests as commonjs
const { version: queryPlannerVersion } = createRequire(__filename)(
  '@graphql-hive/router-query-planner/package.json',
);

interface User {
  id: string;
  currency: string | null;
  txs: { id: string }[];
}

function buildUsersSubgraph(users: User[], codes: unknown[]) {
  return buildSubgraphSchema([
    {
      typeDefs: parse(/* GraphQL */ `
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.8"
            import: ["@key", "@context", "@fromContext"]
          )

        type Query {
          users: [User]
        }

        type User @key(fields: "id") @context(name: "userContext") {
          id: ID!
          currency: String
          txs: [Transaction]
        }

        type Transaction @key(fields: "id") {
          id: ID!
          amount(
            code: String @fromContext(field: "$userContext { currency }")
          ): String
        }
      `),
      resolvers: {
        Query: {
          users: () => users,
        },
        Transaction: {
          __resolveReference: (ref: { id: string }) => ref,
          amount: (tx: { id: string }, { code }: { code?: string }) => {
            codes.push(code);
            return `${tx.id}-${code ?? 'none'}`;
          },
        },
      },
    },
  ]);
}

it('resolves @fromContext arguments from the ancestor setting the context', async () => {
  const codes: unknown[] = [];
  const schema = buildUsersSubgraph(
    [
      { id: 'u1', currency: 'USD', txs: [{ id: 't1' }, { id: 't2' }] },
      { id: 'u2', currency: 'EUR', txs: [{ id: 't1' }] },
      { id: 'u3', currency: null, txs: [{ id: 't3' }] },
    ],
    codes,
  );
  const yoga = createYoga({ schema, maskedErrors: false });

  // the composition the tester uses for subgraphs does not support @fromContext yet
  await using gw = createGatewayTester({
    unifiedGraphHandler,
    supergraph: await composeLocalSchemasWithApollo([
      { name: 'users', schema, url: 'http://users/graphql' },
    ]),
    plugins: () => [
      useQueryPlan({ expose: true }),
      {
        onFetch({ setFetchFn }) {
          setFetchFn(
            // @ts-expect-error native and whatwg-node fetch has conflicts
            yoga.fetch,
          );
        },
      },
    ],
  });

  const result = (await gw.execute({
    query: /* GraphQL */ `
      {
        users {
          txs {
            amount
          }
        }
      }
    `,
  })) as ExecutionResult;

  // guard: the plan must actually use a contextual fetch
  expect(JSON.stringify(result.extensions?.queryPlan)).toContain(
    'contextRewrites',
  );

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    users: [
      { txs: [{ amount: 't1-USD' }, { amount: 't2-USD' }] },
      { txs: [{ amount: 't1-EUR' }] },
      { txs: [{ amount: 't3-none' }] },
    ],
  });
  // every group resolves its own entities, so t1 resolves once per currency
  expect(codes).toEqual(['USD', 'USD', 'EUR', null]);
});

// TODO: drop after bumping @graphql-hive/router-query-planner to 0.0.56, earlier planners
// ignore alias limits
(Number(queryPlannerVersion.split('.')[2]) < 56 ? it.skip : it)(
  'splits @fromContext fetches to stay within the alias limit of the subgraph',
  async () => {
    const currencies = ['A', 'B', 'C', 'D', 'E'];
    const schema = buildUsersSubgraph(
      currencies.map((currency, i) => ({
        id: `u${i}`,
        currency,
        txs: [{ id: `t${i}` }],
      })),
      [],
    );
    const yoga = createYoga({ schema, maskedErrors: false });
    // the `_entities` fields of every request the subgraph got
    const entityFields: number[] = [];

    await using gw = createGatewayTester({
      unifiedGraphHandler,
      supergraph: await composeLocalSchemasWithApollo([
        { name: 'users', schema, url: 'http://users/graphql' },
      ]),
      maxAliasesPerRequest: { '*': 10, users: 2 },
      plugins: () => [
        {
          onFetch({ setFetchFn }) {
            setFetchFn(async (url, init) => {
              const { query } = JSON.parse(String(init?.body));
              const fields = query.match(/_entities\(/g)?.length;
              if (fields) {
                entityFields.push(fields);
              }
              // @ts-expect-error native and whatwg-node fetch has conflicts
              return yoga.fetch(url, init);
            });
          },
        },
      ],
    });

    await expect(
      gw.execute({ query: '{ users { txs { amount } } }' }),
    ).resolves.toEqual({
      data: {
        users: currencies.map((currency, i) => ({
          txs: [{ amount: `t${i}-${currency}` }],
        })),
      },
    });
    expect(entityFields.sort()).toEqual([1, 2, 2]);
  },
);
