import { buildSubgraphSchema, GraphQLSchemaModule } from '@apollo/subgraph';
import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { composeServices } from '@theguild/federation-composition';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { expect, it } from 'vitest';
import { unifiedGraphHandler } from '../src/index';

// https://github.com/graphql-hive/gateway/issues/2737
it('sends the @requires fields of an @interfaceObject field fetched from the owner', async () => {
  const representations: unknown[] = [];
  const subgraphs: Record<string, GraphQLSchemaModule> = {
    owner: {
      typeDefs: parse(/* GraphQL */ `
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.6"
            import: ["@key"]
          )

        interface Location @key(fields: "id") {
          id: ID!
          code: String
        }

        type Store implements Location @key(fields: "id") {
          id: ID!
          code: String
        }

        type Query {
          location(id: ID!): Location
        }
      `),
      resolvers: {
        Query: {
          location: (_: unknown, { id }: { id: string }) => ({
            id,
            code: `code-${id}`,
          }),
        },
        Location: {
          __resolveType: () => 'Store',
        },
      },
    },
    contributor: {
      typeDefs: parse(/* GraphQL */ `
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.6"
            import: ["@key", "@interfaceObject", "@external", "@requires"]
          )

        type Location @key(fields: "id") @interfaceObject {
          id: ID!
          code: String @external
          events: [String!] @requires(fields: "code")
        }

        type Query {
          contributorPing: String
        }
      `),
      resolvers: {
        Location: {
          __resolveReference: (reference: unknown) => {
            representations.push(reference);
            return reference;
          },
          events: ({ code }: { code?: string }) =>
            code ? [`event-at-${code}`] : [],
        },
      },
    },
  };

  // composition below 0.27.1 drops @external from @interfaceObject fields,
  // and the tester composes with an older version, so compose here
  const { supergraphSdl, errors } = composeServices(
    Object.entries(subgraphs).map(([name, { typeDefs }]) => ({
      name,
      typeDefs,
      url: `http://${name}/graphql`,
    })),
  );
  expect(errors).toBeUndefined();

  const yogas = Object.fromEntries(
    Object.entries(subgraphs).map(([name, subgraph]) => [
      name,
      createYoga({
        schema: buildSubgraphSchema([subgraph]),
        maskedErrors: false,
      }),
    ]),
  );

  await using gw = createGatewayTester({
    unifiedGraphHandler,
    supergraph: supergraphSdl!,
    plugins: () => [
      {
        onFetch({ executionRequest, setFetchFn }) {
          setFetchFn(
            // @ts-expect-error native and whatwg-node fetch has conflicts
            yogas[executionRequest!.subgraphName!]!.fetch,
          );
        },
      },
    ],
  });

  for (const query of [
    /* GraphQL */ `
      {
        location(id: "store1") {
          id
          events
        }
      }
    `,
    /* GraphQL */ `
      {
        location(id: "store1") {
          id
          ... on Store {
            events
          }
        }
      }
    `,
  ]) {
    representations.length = 0;
    await expect(gw.execute({ query })).resolves.toEqual({
      data: {
        location: {
          id: 'store1',
          events: ['event-at-code-store1'],
        },
      },
    });
    expect(representations).toEqual([
      { __typename: 'Location', id: 'store1', code: 'code-store1' },
    ]);
  }
});
