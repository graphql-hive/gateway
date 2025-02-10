import { Subschema } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { FragmentDefinitionNode, Kind } from 'graphql';
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
});
