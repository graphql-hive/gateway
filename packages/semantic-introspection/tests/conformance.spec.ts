import { buildSchema, execute, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { applySemanticIntrospection } from '../src/index.js';

/** RFC conformance: query shapes from the ai-wg semantic-introspection RFC examples. */

const SCHEMA_SDL = /* GraphQL */ `
  type Query {
    "Find a user by email"
    userByEmail(email: String!): User
    "Latest posts feed"
    latestPosts: [Post!]!
  }

  type User {
    id: ID!
    "Email address"
    email: String!
  }

  type Post {
    id: ID!
    "Title of the post"
    title: String!
    author: User!
  }

  enum Role {
    ADMIN
    GUEST
  }
`;

// Exact __search query from prompt-graphql-skill.md.
const PASCAL_SEARCH_QUERY = /* GraphQL */ `
  {
    __search(query: "user email", first: 10) {
      coordinate
      score
      pathsToRoot
      definition {
        __typename
        ... on __Field {
          fieldName: name
          type {
            name
            kind
            ofType {
              name
              kind
            }
          }
          args {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
        ... on __Type {
          name
          kind
        }
      }
    }
  }
`;

// Exact __definitions query from prompt-graphql-skill.md.
const PASCAL_DEFINITIONS_QUERY = /* GraphQL */ `
  query ($c: [String!]!) {
    __definitions(coordinates: $c) {
      __typename
      ... on __Type {
        name
        kind
        fields {
          name
          type {
            name
            kind
            ofType {
              name
              kind
            }
          }
          args {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
            defaultValue
          }
        }
        enumValues {
          name
        }
      }
      ... on __Field {
        fieldName: name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
        args {
          name
          type {
            name
            kind
            ofType {
              name
              kind
            }
          }
          defaultValue
        }
      }
    }
  }
`;

describe('RFC conformance', () => {
  it('executes the __search query without errors and returns ranked results', async () => {
    const extended = applySemanticIntrospection(buildSchema(SCHEMA_SDL));
    const result = await execute({
      schema: extended,
      document: parse(PASCAL_SEARCH_QUERY),
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as {
      __search: Array<{
        coordinate: string;
        score: number | null;
        pathsToRoot: string[][];
        definition: { __typename: string };
      }>;
    };
    expect(Array.isArray(data.__search)).toBe(true);
    expect(data.__search.length).toBeGreaterThan(0);
    // Each result must populate the union and pathsToRoot.
    for (const r of data.__search) {
      expect(typeof r.coordinate).toBe('string');
      expect(['__Type', '__Field', '__InputValue', '__EnumValue']).toContain(
        r.definition.__typename,
      );
      expect(Array.isArray(r.pathsToRoot)).toBe(true);
    }
  });

  it('executes the __definitions query without errors and resolves each coordinate', async () => {
    const extended = applySemanticIntrospection(buildSchema(SCHEMA_SDL));
    const result = await execute({
      schema: extended,
      document: parse(PASCAL_DEFINITIONS_QUERY),
      variableValues: { c: ['Query.userByEmail', 'User', 'Role'] },
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as {
      __definitions: Array<Record<string, unknown>>;
    };
    expect(data.__definitions).toHaveLength(3);
  });

  it('expands wrapped types (NonNull/List) via args.type.ofType', async () => {
    const extended = applySemanticIntrospection(buildSchema(SCHEMA_SDL));
    const result = await execute({
      schema: extended,
      document: parse(PASCAL_DEFINITIONS_QUERY),
      variableValues: { c: ['Query.userByEmail'] },
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as {
      __definitions: Array<{
        __typename: string;
        fieldName: string;
        args: Array<{
          name: string;
          type: {
            name: string | null;
            kind: string;
            ofType: { name: string; kind: string } | null;
          };
        }>;
      }>;
    };
    const field = data.__definitions[0]!;
    expect(field.__typename).toBe('__Field');
    expect(field.fieldName).toBe('userByEmail');
    // `email: String!` → NonNull wrapper, ofType = String scalar.
    const emailArg = field.args.find((a) => a.name === 'email')!;
    expect(emailArg.type.kind).toBe('NON_NULL');
    expect(emailArg.type.name).toBeNull();
    expect(emailArg.type.ofType).toEqual({ name: 'String', kind: 'SCALAR' });
  });

  it('returns enumValues on a __Type for an enum coordinate', async () => {
    const extended = applySemanticIntrospection(buildSchema(SCHEMA_SDL));
    const result = await execute({
      schema: extended,
      document: parse(PASCAL_DEFINITIONS_QUERY),
      variableValues: { c: ['Role'] },
    });
    expect(result.errors).toBeUndefined();
    const data = result.data as {
      __definitions: Array<{
        __typename: string;
        name: string;
        kind: string;
        enumValues: Array<{ name: string }> | null;
      }>;
    };
    expect(data.__definitions[0]!.__typename).toBe('__Type');
    expect(data.__definitions[0]!.kind).toBe('ENUM');
    const values = (data.__definitions[0]!.enumValues ?? []).map((v) => v.name);
    expect(values.sort()).toEqual(['ADMIN', 'GUEST']);
  });
});
