import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  Bm25SearchProvider,
  InvalidSearchCursorError,
  SearchQueryTooLargeError,
} from '../../src/provider/bm25/bm25-search-provider.js';

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
    // Use opaque, English-free tokens — graphql-js's built-in scalar
    // descriptions (String/ID/etc.) are indexed too and contain plenty
    // of common words that would otherwise produce stray matches.
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

  it('throws SearchQueryTooLargeError when the query exceeds the limit', async () => {
    const provider = makeProvider();
    const huge = 'a'.repeat(1025);
    await expect(provider.search(huge, 10, null, null)).rejects.toBeInstanceOf(
      SearchQueryTooLargeError,
    );
  });

  it('throws RangeError for non-positive `first`', async () => {
    const provider = makeProvider();
    await expect(provider.search('x', 0, null, null)).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(provider.search('x', -1, null, null)).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  it('throws InvalidSearchCursorError on an empty cursor or garbage cursor', async () => {
    const provider = makeProvider();
    await expect(provider.search('x', 10, '', null)).rejects.toBeInstanceOf(
      InvalidSearchCursorError,
    );
    await expect(
      provider.search('email', 10, 'not-base64-int32', null),
    ).rejects.toBeInstanceOf(InvalidSearchCursorError);
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

  it('finds multiple paths from a deeply reachable type, shortest first', async () => {
    // Post can be reached via Query.posts (length 1) and via
    // Query.user → User.bestPost (length 2).
    const provider = makeProvider();
    const paths = await provider.getPathsToRoot('Post.title');
    expect(paths.length).toBeGreaterThanOrEqual(1);
    // Shortest path: ['Query.posts', 'Post.title'].
    expect(paths[0]).toEqual(['Query.posts', 'Post.title']);
    // Lengths are non-decreasing.
    for (let i = 1; i < paths.length; i++) {
      expect(paths[i]!.length).toBeGreaterThanOrEqual(paths[i - 1]!.length);
    }
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
