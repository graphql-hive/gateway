import { createDefaultExecutor, Subschema } from '@graphql-tools/delegate';
import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import { addMocksToSchema, IMocks } from '@graphql-tools/mock';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { execute, FragmentDefinitionNode, Kind, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { optimizeDelegationMap } from '../src/createDelegationPlanBuilder';

/**
 * Tests for fragment handling in delegation optimization.
 * These tests verify that the delegation plan builder correctly handles GraphQL fragments
 * when optimizing the delegation map across multiple subschemas.
 */
describe('fragment handling in delegation optimization', () => {
  /**
   * First test schema representing a basic User type with profile information.
   * This schema lacks the email field in Profile to test partial field availability.
   */
  const schema1 = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type User {
        id: ID!
        name: String!
        profile: Profile!
      }
      type Profile {
        bio: String!
        location: String!
      }
      type Query {
        user(id: ID!): User
      }
    `,
  });

  /**
   * Second test schema with an extended Profile type that includes an email field.
   * Used to test fragment spreading across schemas with different capabilities.
   */
  const schema2 = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type User {
        id: ID!
        name: String!
        profile: Profile!
      }
      type Profile {
        bio: String!
        location: String!
        email: String!
      }
      type Query {
        user(id: ID!): User
      }
    `,
  });

  const subschema1 = new Subschema({ schema: schema1 });
  const subschema2 = new Subschema({ schema: schema2 });

  /**
   * Tests that the delegation map optimization correctly handles fragments
   * by merging fragment fields into the appropriate subschema selections.
   */
  it('should optimize delegation map considering fragments', () => {
    // Define a fragment that selects basic User fields
    const fragments: Record<string, FragmentDefinitionNode> = {
      UserFields: {
        kind: Kind.FRAGMENT_DEFINITION,
        name: { kind: Kind.NAME, value: 'UserFields' },
        typeCondition: {
          kind: Kind.NAMED_TYPE,
          name: { kind: Kind.NAME, value: 'User' },
        },
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [
            {
              kind: Kind.FIELD,
              name: { kind: Kind.NAME, value: 'id' },
            },
            {
              kind: Kind.FIELD,
              name: { kind: Kind.NAME, value: 'name' },
            },
          ],
        },
      },
    };

    // Set up initial delegation map with fragment spread and profile selection
    const delegationMap = new Map();
    delegationMap.set(subschema1, {
      kind: Kind.SELECTION_SET,
      selections: [
        {
          kind: Kind.FRAGMENT_SPREAD,
          name: { kind: Kind.NAME, value: 'UserFields' },
        },
      ],
    });
    delegationMap.set(subschema2, {
      kind: Kind.SELECTION_SET,
      selections: [
        {
          kind: Kind.FIELD,
          name: { kind: Kind.NAME, value: 'profile' },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [
              {
                kind: Kind.FIELD,
                name: { kind: Kind.NAME, value: 'email' },
              },
            ],
          },
        },
      ],
    });

    optimizeDelegationMap(delegationMap, 'User', fragments);
    // Verify optimization results
    expect(delegationMap.size).toBe(1);
    expect(delegationMap.has(subschema2)).toBe(true);
    const schema2Selections = delegationMap.get(subschema2)!.selections;
    expect(schema2Selections).toEqual([
      {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'profile' },
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [
            {
              kind: Kind.FIELD,
              name: { kind: Kind.NAME, value: 'email' },
            },
          ],
        },
      },
      {
        kind: Kind.FRAGMENT_SPREAD,
        name: { kind: Kind.NAME, value: 'UserFields' },
      },
    ]);
  });

  it('should make sure to properly handle nested fragments', async () => {
    const schema = getStitchedSchemaFromSupergraphSdl({
      supergraphSdl: /* GraphQL */ `
        schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) {
          query: Query
        }

        directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

        directive @join__field(
          graph: join__Graph
          requires: join__FieldSet
          provides: join__FieldSet
          type: String
          external: Boolean
          override: String
          usedOverridden: Boolean
        ) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

        directive @join__graph(name: String!, url: String!) on ENUM_VALUE

        directive @join__implements(
          graph: join__Graph!
          interface: String!
        ) repeatable on OBJECT | INTERFACE

        directive @join__type(
          graph: join__Graph!
          key: join__FieldSet
          extension: Boolean! = false
          resolvable: Boolean! = true
          isInterfaceObject: Boolean! = false
        ) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

        directive @link(
          url: String
          as: String
          for: link__Purpose
          import: [link__Import]
        ) repeatable on SCHEMA

        interface IContact @join__type(graph: UPSTREAM) {
          properties: Json
        }

        interface INode @join__type(graph: UPSTREAM) {
          id: ID!
        }

        scalar join__FieldSet

        enum join__Graph {
          UPSTREAM @join__graph(name: "upstream", url: "")
        }

        scalar Json @join__type(graph: UPSTREAM)

        enum link__Purpose {
          """
          \`EXECUTION\` features provide metadata necessary for operation execution.
          """
          EXECUTION

          """
          \`SECURITY\` features provide metadata necessary to securely resolve fields.
          """
          SECURITY
        }

        scalar link__Import

        type MaybePerson implements IContact & INode
          @join__implements(graph: UPSTREAM, interface: "IContact")
          @join__implements(graph: UPSTREAM, interface: "INode")
          @join__type(graph: UPSTREAM, key: "id") {
          id: ID!
          properties: Json
        }

        type Query @join__type(graph: UPSTREAM) {
          node: INode
        }
      `,
      onSubschemaConfig(subschemaConfig) {
        const mocks: IMocks = {
          INode: () => ({ __typename: 'MaybePerson' }),
          Json: () => ({}),
        };
        const mockedSchema = addMocksToSchema({
          schema: subschemaConfig.schema,
          mocks,
          resolvers: {
            _Entity: {
              __resolveType: ({ __typename }: { __typename: string }) =>
                __typename,
            },
            Query: {
              _entities(_, { representations }) {
                return representations;
              },
            },
          },
        });
        subschemaConfig.executor = createDefaultExecutor(mockedSchema);
      },
    });

    const result = execute({
      document: parse(/* GraphQL */ `
        {
          node {
            ... on IContact {
              ...MaybePerson
            }
          }
        }
        fragment MaybePerson on IContact {
          __typename
          properties
        }
      `),
      schema,
    });

    expect(result).toEqual({
      data: {
        node: {
          __typename: 'MaybePerson',
          properties: {},
        },
      },
    });
  });
});
