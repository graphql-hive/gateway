import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

describe('Relay Object Identification', () => {
  it('should resolve node by id', async () => {
    const accounts = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Person @key(fields: "id") {
          id: ID!
          name: String!
          email: String!
        }
      `),
      resolvers: {
        Person: {
          __resolveReference: (ref) => ({
            id: ref.id,
            name: 'John Doe',
            email: 'john@doe.com',
          }),
        },
      },
    });

    const supergraph = await getStitchedSchemaFromLocalSchemas({
      localSchemas: {
        accounts,
      },
    });

    await expect(
      normalizedExecutor({
        schema: supergraph,
        document: parse(/* GraphQL */ `
          query ($id: ID!) {
            node(id: $id) {
              ... on Person {
                id
                name
                email
              }
            }
          }
        `),
      }),
    ).resolves.toMatchInlineSnapshot();
  });
});
