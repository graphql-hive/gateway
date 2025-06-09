import { buildSubgraphSchema } from '@apollo/subgraph';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { parse } from 'graphql';
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
        __resolveReference: (ref) => data.accounts.find((a) => a.id === ref.id),
      },
    },
  });

  it('should generate stitched schema with node interface', async () => {
    const schema = await getStitchedSchemaFromLocalSchemas({
      globalObjectIdentification: true,
      localSchemas: {
        accounts,
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
});
