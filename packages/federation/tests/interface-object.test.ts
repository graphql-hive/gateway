import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { ExecutionRequest } from '@graphql-tools/utils';
import { GraphQLSchema, parse, print } from 'graphql';
import { describe, expect, it } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

async function execute(
  localSchemas: Record<string, GraphQLSchema>,
  query: string,
) {
  const subgraphCalls: { subgraph: string; query: string; variables?: any }[] =
    [];
  const schema = await getStitchedSchemaFromLocalSchemas({
    localSchemas,
    composeWith: 'guild',
    onSubgraphExecute(subgraph, executionRequest: ExecutionRequest) {
      subgraphCalls.push({
        subgraph,
        query: print(executionRequest.document),
        variables: executionRequest.variables,
      });
    },
  });
  const result = await normalizedExecutor({
    schema,
    document: parse(query),
  });
  return { result, subgraphCalls };
}

describe('@interfaceObject', () => {
  // https://github.com/graphql-hive/gateway/issues/2737
  it('sends the @requires fields to the interface object when selected through an inline fragment on the implementation', async () => {
    const owner = buildSubgraphSchema({
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
    });
    const contributor = buildSubgraphSchema({
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
          __resolveReference: (reference: unknown) => reference,
          events: ({ code }: { code?: string }) =>
            code ? [`event-at-${code}`] : [],
        },
      },
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
      const { result } = await execute({ owner, contributor }, query);
      expect(result).toEqual({
        data: {
          location: {
            id: 'store1',
            events: ['event-at-code-store1'],
          },
        },
      });
    }
  });
});
