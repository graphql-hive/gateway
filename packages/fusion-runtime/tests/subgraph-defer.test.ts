import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { buildSchema, type GraphQLSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  handleFederationSupergraph,
  isSubgraphDeferEnabled,
} from '../src/federation/supergraph.js';
import { ensureSchema } from '../src/unifiedGraphManager.js';

describe('isSubgraphDeferEnabled', () => {
  it('returns false when unset', () => {
    expect(isSubgraphDeferEnabled(undefined, 'users')).toBe(false);
  });

  it('enables all subgraphs when true', () => {
    expect(isSubgraphDeferEnabled(true, 'users')).toBe(true);
    expect(isSubgraphDeferEnabled(true, undefined)).toBe(true);
  });

  it('respects per-subgraph map and * default', () => {
    expect(isSubgraphDeferEnabled({ users: true }, 'users')).toBe(true);
    expect(isSubgraphDeferEnabled({ users: true }, 'posts')).toBe(false);
    expect(isSubgraphDeferEnabled({ '*': true, posts: false }, 'users')).toBe(
      true,
    );
    expect(isSubgraphDeferEnabled({ '*': true, posts: false }, 'posts')).toBe(
      false,
    );
  });
});

describe('handleFederationSupergraph subgraphDefer', () => {
  it('sets SubschemaConfig.defer from subgraphDefer config', () => {
    const users = buildSchema(/* GraphQL */ `
      type Query {
        me: User
      }
      type User {
        id: ID!
        name: String
      }
    `);
    const posts = buildSchema(/* GraphQL */ `
      type Query {
        post: Post
      }
      type Post {
        id: ID!
        title: String
      }
    `);
    const unifiedGraph = ensureSchema(
      getUnifiedGraphGracefully([
        { name: 'users', schema: users },
        { name: 'posts', schema: posts },
      ]),
    ) as GraphQLSchema;

    const { getSubschema } = handleFederationSupergraph({
      unifiedGraph,
      getUnifiedGraphSDL: () => '',
      onSubgraphExecute: () => ({ data: null }),
      subgraphDefer: { users: true, posts: false },
    });

    expect(getSubschema('users').defer).toBe(true);
    expect(getSubschema('posts').defer).toBeFalsy();
  });
});
