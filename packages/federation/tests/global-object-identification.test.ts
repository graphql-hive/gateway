import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { parse } from 'graphql';
import { toGlobalId } from 'graphql-relay';
import { describe, expect, it } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

describe('Global Object Identification', () => {
  const data = {
    accounts: [
      {
        id: 'a1',
        name: 'John Doe',
        email: 'john@doe.com',
      },
    ],
  };

  const people = buildSubgraphSchema({
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
      Query: {
        people: () => data.accounts,
      },
      Person: {
        __resolveReference: (ref) => data.accounts.find((a) => a.id === ref.id),
      },
    },
  });

  it('should generate stitched schema with node interface', async () => {
    const schema = await getStitchedSchemaFromLocalSchemas({
      globalObjectIdentification: true,
      localSchemas: {
        people,
      },
    });

    expect(printSchemaWithDirectives(schema)).toMatchInlineSnapshot(`
      "schema {
        query: Query
      }

      type Query {
        people: [Person!]!
        """Fetches an object given its globally unique \`ID\`."""
        node(
          """The globally unique \`ID\`."""
          nodeId: ID!
        ): Node
      }

      type Person implements Node {
        id: ID!
        name: String!
        email: String!
        """
        A globally unique identifier. Can be used in various places throughout the system to identify this single value.
        """
        nodeId: ID!
      }

      interface Node {
        """
        A globally unique identifier. Can be used in various places throughout the system to identify this single value.
        """
        nodeId: ID!
      }"
    `);
  });

  it('should resolve object from globally unique node', async () => {
    const schema = await getStitchedSchemaFromLocalSchemas({
      globalObjectIdentification: true,
      localSchemas: {
        people,
      },
    });

    await expect(
      Promise.resolve(
        normalizedExecutor({
          schema,
          document: parse(/* GraphQL */ `
        {
          node(nodeId: "${toGlobalId('Person', 'a1')}") {
            nodeId
            ... on Person {
              id
              name
              email
            }
          }
        }
      `),
        }),
      ),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "node": {
            "email": "john@doe.com",
            "id": "a1",
            "name": "John Doe",
            "nodeId": "UGVyc29uOmEx",
          },
        },
      }
    `);
  });
});
