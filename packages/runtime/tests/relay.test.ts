import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import { MaybePromise } from '@whatwg-node/promise-helpers';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';

describe('Node interface', () => {
  it('handles single node resolution', async () => {
    interface Node {
      id: string;
    }
    interface User extends Node {
      name: string;
      age: number;
    }
    interface Post extends Node {
      title: string;
      content: string;
      userId: string;
    }
    const posts: Post[] = [
      { id: 'post:1', title: 'Post 1', content: 'Content 1', userId: 'user:3' },
      { id: 'post:2', title: 'Post 2', content: 'Content 2', userId: 'user:2' },
      { id: 'post:3', title: 'Post 3', content: 'Content 3', userId: 'user:1' },
    ];
    const users: User[] = [
      { id: 'user:1', name: 'User 1', age: 20 },
      { id: 'user:2', name: 'User 2', age: 30 },
      { id: 'user:3', name: 'User 3', age: 40 },
    ];
    const nodes: Node[] = [...posts, ...users];

    const userSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        interface Node {
          id: ID!
        }
        type User implements Node @key(fields: "id") {
          id: ID!
          name: String!
          age: Int!
        }
        type Query {
          node(id: ID!): Node
          user(id: ID!): User
        }
      `),
      resolvers: {
        Query: {
          node: (_root, { id }) => nodes.find((node) => node.id === id),
          user: (_root, { id }) => users.find((user) => user.id === id),
        },
        User: {
          __resolveReference: (user) => users.find((u) => u.id === user.id),
        },
      },
    });
    await using userSubgraphServer = createYoga({
      schema: userSubgraph,
    });
    const postSubgraph = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        interface Node {
          id: ID!
        }
        type Post implements Node @key(fields: "id") {
          id: ID!
          title: String!
          content: String!
          author: User!
        }
        extend type User @key(fields: "id") {
          id: ID! @external
          posts: [Post!]!
        }
        type Query {
          node(id: ID!): Node
          post(id: ID!): Post
        }
      `),
      resolvers: {
        Query: {
          node: (_root, { id }) => nodes.find((node) => node.id === id),
          post: (_root, { id }) => posts.find((post) => post.id === id),
        },
        Post: {
          __resolveReference: (post) => posts.find((p) => p.id === post.id),
          author: (post) => ({ __typename: 'User', id: post.userId }),
        },
        User: {
          __resolveReference: (user) => user,
          posts: (user) => posts.filter((post) => post.userId === user.id),
        },
      },
    });
    await using postSubgraphServer = createYoga({
      schema: postSubgraph,
    });
    const supergraph = await composeLocalSchemasWithApollo([
      { name: 'user', schema: userSubgraph, url: 'http://user/graphql' },
      { name: 'post', schema: postSubgraph, url: 'http://post/graphql' },
    ]);
    await using gateway = createGatewayRuntime({
      supergraph,
      plugins: () => [
        useCustomFetch(function (url, opts): MaybePromise<Response> {
          if (url === 'http://user/graphql') {
            return userSubgraphServer.fetch(url, opts as RequestInit);
          }
          if (url === 'http://post/graphql') {
            return postSubgraphServer.fetch(url, opts as RequestInit);
          }
          return new gateway.fetchAPI.Response('Not Found', { status: 404 });
        }),
      ],
    });
    const response = await gateway.fetch('http://gateway/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            post1: node(id: "post:1") {
              ... on Post {
                title
                content
                author {
                  name
                  age
                }
              }
            }
            user1: node(id: "user:1") {
              ... on User {
                name
                age
                posts {
                  title
                  content
                }
              }
            }
          }
        `,
      }),
    });
    const result = await response.json();
    expect(result).toEqual({});
  });
});
