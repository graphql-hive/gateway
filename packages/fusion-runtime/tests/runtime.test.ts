import { buildSubgraphSchema } from '@apollo/subgraph';
import { Logger } from '@graphql-hive/logger';
import {
  OnDelegationPlanDoneHook,
  OnDelegationPlanHook,
} from '@graphql-mesh/fusion-runtime';
import { Subschema } from '@graphql-tools/delegate';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { usingHiveRouterRuntime } from '~internal/env';
import { GraphQLSchema, Kind, parse, print } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { composeAndGetExecutor } from './utils';

describe('handleFederationSubschema', () => {
  it.skipIf(
    // TODO: this needs to work with the Hive Router Query Planner as well
    usingHiveRouterRuntime(),
  )('combine federation merging and custom merging', async () => {
    const users = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        directive @merge(keyField: String) on FIELD_DEFINITION

        type Query {
          userById(id: ID!): User @merge(keyField: "id")
        }

        type User {
          id: ID!
          name: String
          posts: [Post]
        }

        type Post @key(fields: "id") {
          id: ID!
          author: User
        }
      `),
      resolvers: {
        Query: {
          userById(_root, { id }) {
            return { id, name: `User ${id}` };
          },
        },
        Post: {
          __resolveReference(post) {
            return { id: post.id };
          },
          author(post) {
            return { id: post.id, name: `User ${post.id}` };
          },
        },
        User: {
          posts() {
            return [{ id: '1' }];
          },
        },
      },
    });
    const posts = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          posts: [Post]
        }

        type Post @key(fields: "id") {
          id: ID!
          title: String
        }
      `),
      resolvers: {
        Query: {
          posts() {
            return [{ id: '1', title: 'Post 1' }];
          },
        },
        Post: {
          __resolveReference(post) {
            return { id: post.id };
          },
          title(post) {
            return `Post ${post.id}`;
          },
        },
      },
    });
    const executor = composeAndGetExecutor([
      {
        schema: users,
        name: 'users',
      },
      {
        schema: posts,
        name: 'posts',
      },
    ]);
    const result = await executor({
      query: /* GraphQL */ `
        query {
          userById(id: "1") {
            id
            name
            posts {
              id
              title
              author {
                id
                name
              }
            }
          }
          posts {
            id
            title
            author {
              id
              name
            }
          }
        }
      `,
    });
    expect(result).toMatchObject({
      userById: {
        id: '1',
        name: 'User 1',
        posts: [
          {
            id: '1',
            title: 'Post 1',
            author: {
              id: '1',
              name: 'User 1',
            },
          },
        ],
      },
      posts: [
        {
          id: '1',
          title: 'Post 1',
          author: {
            id: '1',
            name: 'User 1',
          },
        },
      ],
    });
  });
});

describe.skipIf(usingHiveRouterRuntime())('onDelegationPlanHook', () => {
  it('should be called with the plan', async () => {
    const user = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          users: [User]
        }

        type User @key(fields: "id") {
          id: ID!
          name: String
        }
      `),
      resolvers: {
        Query: {
          users() {
            return [{ id: '1', name: 'User 1' }];
          },
        },
        User: {
          __resolveReference(user) {
            return { id: user.id };
          },
          name(user) {
            return `User ${user.id}`;
          },
        },
      },
    });
    const posts = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          posts: [Post]
        }

        type Post @key(fields: "id") {
          id: ID!
          title: String
          author: User
        }

        extend type User @key(fields: "id") {
          id: ID!
        }
      `),
      resolvers: {
        Query: {
          posts() {
            return [
              { id: '1', authorId: 1 },
              { id: '2', authorId: 1 },
            ];
          },
        },
        Post: {
          __resolveReference(post) {
            return { id: post.id, authorId: 1 };
          },
          title(post) {
            return `Post ${post.id}`;
          },
          author(post) {
            return { id: post.authorId };
          },
        },
      },
    });
    const onDelegationPlanDoneHook = vi.fn<OnDelegationPlanDoneHook>();
    const context = {
      myContextValue: 'myContextValue',
    };
    const onDelegationPlanHook = vi.fn<OnDelegationPlanHook<typeof context>>(
      () => onDelegationPlanDoneHook,
    );
    const executor = composeAndGetExecutor(
      [
        {
          schema: user,
          name: 'user',
        },
        {
          schema: posts,
          name: 'posts',
        },
      ],
      {
        onDelegationPlanHooks: [onDelegationPlanHook],
      },
    );
    const result = await executor({
      query: /* GraphQL */ `
        query {
          posts {
            id
            title
            author {
              id
              name
            }
          }
        }
      `,
      context,
    });
    expect(onDelegationPlanHook).toHaveBeenCalledTimes(1);
    const onDelegationPlanPayload = onDelegationPlanHook.mock.calls[0]![0];
    expect(onDelegationPlanPayload).toEqual({
      supergraph: expect.any(GraphQLSchema),
      subgraph: expect.any(String),
      sourceSubschema: expect.any(Subschema),
      typeName: expect.any(String),
      variables: expect.any(Object),
      fragments: {},
      fieldNodes: expect.arrayContaining([
        expect.objectContaining({
          kind: Kind.FIELD,
        }),
      ]),
      context,
      delegationPlanBuilder: expect.any(Function),
      setDelegationPlanBuilder: expect.any(Function),
      log: expect.any(Logger),
      info: expect.any(Object),
    });
    expect(
      printSchemaWithDirectives(onDelegationPlanPayload.supergraph),
    ).toMatchSnapshot('onDelegationPlanPayload.supergraph');
    expect(onDelegationPlanPayload.subgraph).toMatchSnapshot(
      'onDelegationPlanPayload.subgraph',
    );
    expect(onDelegationPlanPayload.typeName).toMatchSnapshot(
      'onDelegationPlanPayload.typeName',
    );
    expect(onDelegationPlanPayload.variables).toMatchSnapshot(
      'onDelegationPlanPayload.variables',
    );
    expect(print(onDelegationPlanPayload.fieldNodes[0]!)).toMatchSnapshot(
      'onDelegationPlanPayload.fieldNodes[0]',
    );
    expect(result).toEqual({
      posts: [
        {
          id: '1',
          title: 'Post 1',
          author: {
            id: '1',
            name: 'User 1',
          },
        },
        {
          id: '2',
          title: 'Post 2',
          author: {
            id: '1',
            name: 'User 1',
          },
        },
      ],
    });
  });
});
