import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { indexSchema } from '../../src/provider/bm25/schema-indexer.js';

function coordinates(documents: { coordinate: string }[]): string[] {
  return documents.map((d) => d.coordinate).sort();
}

const FIXTURE_SDL = /* GraphQL */ `
  """
  Top-level query
  """
  type Query {
    user(id: ID!): User
    legacyThing: String @deprecated(reason: "old")
  }

  type User {
    id: ID!
    "Full name"
    name: String!
    oldField: String @deprecated(reason: "use name")
  }

  enum Status {
    ACTIVE
    PENDING
    LEGACY @deprecated(reason: "removed")
  }

  input UserFilter {
    name: String
    legacyKey: String @deprecated(reason: "use name")
  }
`;

describe('indexSchema', () => {
  it('indexes types, fields on complex types, enum values, and input-object fields', () => {
    const { documents } = indexSchema(buildSchema(FIXTURE_SDL));
    const coords = coordinates(documents);

    // Types themselves.
    expect(coords).toContain('Query');
    expect(coords).toContain('User');
    expect(coords).toContain('Status');
    expect(coords).toContain('UserFilter');

    // Complex-type fields.
    expect(coords).toContain('Query.user');
    expect(coords).toContain('Query.legacyThing');
    expect(coords).toContain('User.id');
    expect(coords).toContain('User.name');
    expect(coords).toContain('User.oldField');

    // Enum values.
    expect(coords).toContain('Status.ACTIVE');
    expect(coords).toContain('Status.PENDING');
    expect(coords).toContain('Status.LEGACY');

    // Input-object fields.
    expect(coords).toContain('UserFilter.name');
    expect(coords).toContain('UserFilter.legacyKey');
  });

  it('skips __-prefixed types and fields (introspection namespace)', () => {
    const { documents } = indexSchema(buildSchema(FIXTURE_SDL));
    const coords = coordinates(documents);
    for (const c of coords) {
      expect(c.startsWith('__')).toBe(false);
    }
  });

  it('emits text = name + " " + description when description is present', () => {
    const { documents } = indexSchema(buildSchema(FIXTURE_SDL));
    const userName = documents.find((d) => d.coordinate === 'User.name')!;
    expect(userName.text).toBe('name Full name');

    const userId = documents.find((d) => d.coordinate === 'User.id')!;
    expect(userId.text).toBe('id'); // no description → just the name
  });

  it('builds a reverse adjacency map of return-type → coordinates', () => {
    const { reverseMap } = indexSchema(buildSchema(FIXTURE_SDL));
    expect(reverseMap.get('User')).toEqual(['Query.user']);
    // `String` is referenced by several fields.
    expect(reverseMap.get('String')!.sort()).toEqual(
      ['Query.legacyThing', 'User.name', 'User.oldField'].sort(),
    );
  });

  describe('excludeDeprecated: true', () => {
    it('skips @deprecated fields on object types', () => {
      const { documents } = indexSchema(buildSchema(FIXTURE_SDL), {
        excludeDeprecated: true,
      });
      const coords = coordinates(documents);
      expect(coords).not.toContain('User.oldField');
      expect(coords).not.toContain('Query.legacyThing');
      // Non-deprecated peers survive.
      expect(coords).toContain('User.name');
      expect(coords).toContain('Query.user');
    });

    it('skips @deprecated enum values', () => {
      const { documents } = indexSchema(buildSchema(FIXTURE_SDL), {
        excludeDeprecated: true,
      });
      const coords = coordinates(documents);
      expect(coords).not.toContain('Status.LEGACY');
      expect(coords).toContain('Status.ACTIVE');
      expect(coords).toContain('Status.PENDING');
    });

    it('skips @deprecated input-object fields', () => {
      const { documents } = indexSchema(buildSchema(FIXTURE_SDL), {
        excludeDeprecated: true,
      });
      const coords = coordinates(documents);
      expect(coords).not.toContain('UserFilter.legacyKey');
      expect(coords).toContain('UserFilter.name');
    });

    it('skips members deprecated with an empty-string reason', () => {
      const { documents } = indexSchema(
        buildSchema(/* GraphQL */ `
          type Query {
            kept: String
            silent: String @deprecated(reason: "")
          }
          enum Status {
            ACTIVE
            QUIET @deprecated(reason: "")
          }
          input Filter {
            name: String
            mute: String @deprecated(reason: "")
          }
        `),
        { excludeDeprecated: true },
      );
      const coords = coordinates(documents);
      expect(coords).not.toContain('Query.silent');
      expect(coords).not.toContain('Status.QUIET');
      expect(coords).not.toContain('Filter.mute');
      // Non-deprecated peers still index.
      expect(coords).toContain('Query.kept');
      expect(coords).toContain('Status.ACTIVE');
      expect(coords).toContain('Filter.name');
    });

    it('does not skip the parent type when all members are deprecated', () => {
      const { documents } = indexSchema(
        buildSchema(`
          type Query { _: Boolean }
          type Stale {
            old: String @deprecated(reason: "gone")
          }
        `),
        { excludeDeprecated: true },
      );
      expect(documents.find((d) => d.coordinate === 'Stale')).toBeDefined();
      expect(
        documents.find((d) => d.coordinate === 'Stale.old'),
      ).toBeUndefined();
    });
  });
});
