import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { Bm25SearchProvider } from '../../src/provider/bm25/bm25-search-provider.js';

const SCHEMA_SDL = /* GraphQL */ `
  type Query {
    "Find a user by id"
    user(id: ID!): User
    "Latest posts feed"
    posts: [Post!]!
  }

  type User {
    id: ID!
    "Email address of the user"
    email: String!
    bestPost: Post
  }

  type Post {
    id: ID!
    "Article title"
    title: String!
    author: User!
  }
`;

function makeProvider(opts?: { excludeDeprecated?: boolean }) {
  return new Bm25SearchProvider(buildSchema(SCHEMA_SDL), opts);
}

describe('Bm25SearchProvider.search', () => {
  it('returns ranked coordinates for a relevant query', async () => {
    const provider = makeProvider();
    const results = await provider.search('email', 10, null, null);
    expect(results.length).toBeGreaterThan(0);
    const coords = results.map((r) => r.coordinate);
    expect(coords).toContain('User.email');
  });

  it('returns [] for a non-matching query', async () => {
    const provider = makeProvider();
    // Opaque tokens — built-in scalar descriptions are indexed too.
    expect(
      await provider.search('zqzqzq qpqpqp wkwkwk', 10, null, null),
    ).toEqual([]);
  });

  it('normalizes scores into [0, 1] with the top result at 1', async () => {
    const provider = makeProvider();
    const results = await provider.search('title', 10, null, null);
    expect(results[0]!.score).toBeCloseTo(1, 6);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('limits to `first` results', async () => {
    const provider = makeProvider();
    const all = await provider.search('user post title email', 100, null, null);
    const first2 = await provider.search(
      'user post title email',
      2,
      null,
      null,
    );
    expect(first2.length).toBe(2);
    expect(first2[0]!.coordinate).toBe(all[0]!.coordinate);
    expect(first2[1]!.coordinate).toBe(all[1]!.coordinate);
  });

  it('paginates with the cursor from a prior result', async () => {
    const provider = makeProvider();
    const page1 = await provider.search('user post title email', 2, null, null);
    expect(page1).toHaveLength(2);
    const page2 = await provider.search(
      'user post title email',
      2,
      page1[1]!.cursor,
      null,
    );
    // The two pages together should not duplicate the first two coords.
    const seen = new Set(page1.map((r) => r.coordinate));
    for (const r of page2) {
      expect(seen.has(r.coordinate)).toBe(false);
    }
  });

  it('respects minScore by stopping once below the threshold', async () => {
    const provider = makeProvider();
    const all = await provider.search('user', 100, null, 0);
    const high = await provider.search('user', 100, null, 0.99);
    expect(high.length).toBeLessThanOrEqual(all.length);
    for (const r of high) {
      expect(r.score).toBeGreaterThanOrEqual(0.99);
    }
  });

  it('rejects queries that exceed the maximum length', async () => {
    const provider = makeProvider();
    const huge = 'a'.repeat(1025);
    await expect(provider.search(huge, 10, null, null)).rejects.toThrow(
      /maximum length/,
    );
  });

  it('rejects non-positive `first`', async () => {
    const provider = makeProvider();
    await expect(provider.search('x', 0, null, null)).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(provider.search('x', -1, null, null)).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  it('rejects an empty or malformed cursor', async () => {
    const provider = makeProvider();
    await expect(provider.search('x', 10, '', null)).rejects.toThrow(
      /Invalid search cursor/,
    );
    await expect(
      provider.search('email', 10, 'not-base64-int32', null),
    ).rejects.toThrow(/Invalid search cursor/);
  });
});

describe('Bm25SearchProvider.getPathsToRoot', () => {
  it('returns the coordinate itself for a field directly on the root', async () => {
    const provider = makeProvider();
    const paths = await provider.getPathsToRoot('Query.user');
    expect(paths).toEqual([['Query.user']]);
  });

  it('returns [] for the root type coordinate itself', async () => {
    const provider = makeProvider();
    expect(await provider.getPathsToRoot('Query')).toEqual([]);
  });

  it('finds every path from a deeply reachable type, shortest first', async () => {
    // Post.title is reachable two distinct ways from Query:
    //   Query.posts → Post.title             (length 2)
    //   Query.user → User.bestPost → Post.title (length 3)
    const provider = makeProvider();
    const paths = await provider.getPathsToRoot('Post.title');
    expect(paths).toEqual([
      ['Query.posts', 'Post.title'],
      ['Query.user', 'User.bestPost', 'Post.title'],
    ]);
  });

  it('returns distinct paths when multiple root fields return the same type', async () => {
    const schema = buildSchema(/* GraphQL */ `
      type Query {
        primaryUser: User
        backupUser: User
      }
      type User {
        email: String!
      }
    `);
    const provider = new Bm25SearchProvider(schema);
    const paths = await provider.getPathsToRoot('User.email');
    expect(paths).toEqual([
      ['Query.primaryUser', 'User.email'],
      ['Query.backupUser', 'User.email'],
    ]);
  });

  it('returns [] for an unreachable coordinate', async () => {
    const provider = makeProvider();
    expect(await provider.getPathsToRoot('Nope.missing')).toEqual([]);
  });
});

describe('Bm25SearchProvider with excludeDeprecated', () => {
  const SDL_WITH_DEPRECATED = /* GraphQL */ `
    type Query {
      modern: String
      legacy: String @deprecated(reason: "use modern")
    }
  `;

  it('omits deprecated coordinates from search results', async () => {
    const provider = new Bm25SearchProvider(buildSchema(SDL_WITH_DEPRECATED), {
      excludeDeprecated: true,
    });
    const results = await provider.search('legacy modern', 10, null, null);
    const coords = results.map((r) => r.coordinate);
    expect(coords).toContain('Query.modern');
    expect(coords).not.toContain('Query.legacy');
  });

  it('default (excludeDeprecated: false) surfaces deprecated coordinates', async () => {
    const provider = new Bm25SearchProvider(buildSchema(SDL_WITH_DEPRECATED));
    const results = await provider.search('legacy', 10, null, null);
    expect(results.some((r) => r.coordinate === 'Query.legacy')).toBe(true);
  });
});
