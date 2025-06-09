import { buildSubgraphSchema } from '@apollo/subgraph';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { stitchLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

describe('Relay Object Identification', () => {
  it('should resolve node by id', async () => {
    const accounts = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          people: [Person!]!
        }
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

    const { execute } = await stitchLocalSchemas({
      relayObjectIdentification: true,
      localSchemas: {
        accounts,
      },
    });

    await expect(
      execute({
        query: /* GraphQL */ `
          query ($id: ID!) {
            node(id: $id) {
              ... on Person {
                id
                name
                email
              }
            }
          }
        `,
        variables: { id: '1' },
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {},
      }
    `);
  });
});
