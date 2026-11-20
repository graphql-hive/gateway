import { buildSubgraphSchema } from '@apollo/subgraph';
import { usingHiveRouterRuntime } from '~internal/env';
import { buildSchema, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { handleFederationSubschema } from '../src/federation/subgraph';
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

  it('applies Mesh @source renames when @source is imported directly', () => {
    const schema = buildSchema(/* GraphQL */ `
      directive @link(
        url: String
        as: String
        for: link__Purpose
        import: [link__Import]
      ) repeatable on SCHEMA

      scalar link__Import
      enum link__Purpose {
        SECURITY
        EXECUTION
      }

      directive @source(
        subgraph: String!
        name: String
        type: String
      ) repeatable on OBJECT | FIELD_DEFINITION

      extend schema
        @link(
          url: "https://the-guild.dev/graphql/mesh/spec/v1.0"
          import: ["@source"]
        )

      type Query {
        me: User @source(subgraph: "users", name: "myMe")
      }

      type User @source(subgraph: "users", name: "MyUser") {
        id: ID!
      }
    `);

    const handled = handleFederationSubschema({
      subschemaConfig: {
        name: 'users',
        schema,
      },
      additionalTypeDefs: [],
      stitchingDirectivesTransformer: (subschemaConfig) => subschemaConfig,
      onSubgraphExecute: async () => ({ data: null }),
    });

    expect(handled.schema.getType('MyUser')).toBeDefined();
    expect(handled.schema.getQueryType()?.getFields()['myMe']).toBeDefined();
  });

  it('applies Mesh @source renames when @source is imported with alias', () => {
    const schema = buildSchema(/* GraphQL */ `
      directive @link(
        url: String
        as: String
        for: link__Purpose
        import: [link__Import]
      ) repeatable on SCHEMA

      scalar link__Import
      enum link__Purpose {
        SECURITY
        EXECUTION
      }

      directive @mesh__source(
        subgraph: String!
        name: String
        type: String
      ) repeatable on OBJECT | FIELD_DEFINITION

      extend schema
        @link(
          url: "https://the-guild.dev/graphql/mesh/spec/v1.0"
          import: [{ name: "@source", as: "@mesh__source" }]
        )

      type Query {
        me: User @mesh__source(subgraph: "users", name: "myMe")
      }

      type User @mesh__source(subgraph: "users", name: "MyUser") {
        id: ID!
      }
    `);

    const handled = handleFederationSubschema({
      subschemaConfig: {
        name: 'users',
        schema,
      },
      additionalTypeDefs: [],
      stitchingDirectivesTransformer: (subschemaConfig) => subschemaConfig,
      onSubgraphExecute: async () => ({ data: null }),
    });

    expect(handled.schema.getType('MyUser')).toBeDefined();
    expect(handled.schema.getQueryType()?.getFields()['myMe']).toBeDefined();
  });
});
