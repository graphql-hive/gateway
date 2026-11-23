import { buildSubgraphSchema } from '@apollo/subgraph';
import { Logger } from '@graphql-hive/logger';
import {
  OnDelegationPlanDoneHook,
  OnDelegationPlanHook,
} from '@graphql-mesh/fusion-runtime';
import { Subschema } from '@graphql-tools/delegate';
import {
  getDirectiveExtensions,
  printSchemaWithDirectives,
} from '@graphql-tools/utils';
import { usingHiveRouterRuntime } from '~internal/env';
import { buildSchema, GraphQLSchema, Kind, parse, print } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { handleFederationSubschema } from '../src/federation/subgraph';
import { getTransportEntryMapUsingFusionAndFederationDirectives } from '../src/utils';
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
    expect(printSchemaWithDirectives(onDelegationPlanPayload.supergraph))
      .toMatchInlineSnapshot(`
      "schema {
        query: Query
      }

      type Query {
        posts: [Post]
        users: [User]
      }

      type Post {
        id: ID!
        title: String
        author: User
      }

      type User {
        id: ID!
        name: String
      }"
    `);
    expect(onDelegationPlanPayload.subgraph).toMatchInlineSnapshot(`"posts"`);
    expect(onDelegationPlanPayload.typeName).toMatchInlineSnapshot(`"User"`);
    expect(onDelegationPlanPayload.variables).toMatchInlineSnapshot(`{}`);
    expect(print(onDelegationPlanPayload.fieldNodes[0]!)).toMatchInlineSnapshot(
      `
      "author {
        id
        name
      }"
    `,
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

describe('getTransportEntryMapUsingFusionAndFederationDirectives', () => {
  it('reads transport from schema @join__directive(name: "transport")', () => {
    const schema = buildSchema(/* GraphQL */ `
      directive @link(
        url: String
        as: String
        for: String
        import: [String]
      ) repeatable on SCHEMA
      directive @join__graph(name: String!, url: String) on ENUM_VALUE
      directive @join__directive(
        graphs: [join__Graph!]
        name: String!
        args: join__DirectiveArguments
      ) repeatable on SCHEMA | OBJECT | FIELD_DEFINITION | INTERFACE

      scalar join__DirectiveArguments

      enum join__Graph {
        THRIFT @join__graph(name: "thrift", url: "http://thrift.local")
      }

      schema
        @join__directive(
          graphs: [THRIFT]
          name: "transport"
          args: {
            kind: "thrift"
            location: "http://thrift.local"
            options: { serviceName: "Demo" }
          }
        ) {
        query: Query
      }

      type Query {
        hello: String
      }
    `);

    const map = getTransportEntryMapUsingFusionAndFederationDirectives(schema);
    expect(map['thrift']).toMatchObject({
      subgraph: 'thrift',
      kind: 'thrift',
      location: 'http://thrift.local',
    });
    expect(map['thrift']?.options).toEqual({ serviceName: 'Demo' });
  });

  it('infers kind connect from field @join__directive(name: "connect")', () => {
    const schema = buildSchema(/* GraphQL */ `
      directive @join__graph(name: String!, url: String) on ENUM_VALUE
      directive @join__directive(
        graphs: [join__Graph!]
        name: String!
        args: join__DirectiveArguments
      ) repeatable on SCHEMA | OBJECT | FIELD_DEFINITION | INTERFACE

      scalar join__DirectiveArguments

      enum join__Graph {
        REVIEWS @join__graph(name: "reviews", url: "")
      }

      type Query {
        review(id: ID!): String
          @join__directive(
            graphs: [REVIEWS]
            name: "connect"
            args: { http: { GET: "/reviews/{$args.id}" } }
          )
      }
    `);

    const map = getTransportEntryMapUsingFusionAndFederationDirectives(schema);
    expect(map['reviews']).toMatchObject({
      subgraph: 'reviews',
      kind: 'connect',
    });
  });

  it('infers connect from SCHEMA @source with http.baseURL, not Mesh type @source', () => {
    const schema = buildSchema(/* GraphQL */ `
      directive @join__graph(name: String!, url: String) on ENUM_VALUE
      directive @join__directive(
        graphs: [join__Graph!]
        name: String!
        args: join__DirectiveArguments
      ) repeatable on SCHEMA | OBJECT | FIELD_DEFINITION | INTERFACE

      scalar join__DirectiveArguments

      enum join__Graph {
        HTTP @join__graph(name: "http", url: "http://api.local")
        CONNECTORS @join__graph(name: "connectors", url: "")
      }

      schema
        @join__directive(
          graphs: [CONNECTORS]
          name: "source"
          args: { name: "widgets", http: { baseURL: "http://widgets.local" } }
        ) {
        query: Query
      }

      type Author
        @join__directive(
          graphs: [HTTP]
          name: "source"
          args: { name: "AuthorWithBooks" }
        ) {
        id: ID!
      }

      type Query {
        author(id: ID!): Author
      }
    `);

    const map = getTransportEntryMapUsingFusionAndFederationDirectives(schema);
    expect(map['connectors']).toMatchObject({
      subgraph: 'connectors',
      kind: 'connect',
      location: 'http://widgets.local',
    });
    // Mesh stitching type `@source` must not flip HTTP transport to connect.
    expect(map['http']).toMatchObject({
      subgraph: 'http',
      kind: 'http',
      location: 'http://api.local',
    });
  });

  it('accepts Mesh core @link v0.1 and rejects unsupported versions', () => {
    const ok = buildSchema(/* GraphQL */ `
      directive @link(url: String, import: [String]) repeatable on SCHEMA

      schema
        @link(
          url: "https://specs.graphql-mesh.com/core/v0.1"
          import: ["@source"]
        ) {
        query: Query
      }

      type Query {
        hello: String
      }
    `);
    expect(() =>
      getTransportEntryMapUsingFusionAndFederationDirectives(ok),
    ).not.toThrow();

    const bad = buildSchema(/* GraphQL */ `
      directive @link(url: String, import: [String]) repeatable on SCHEMA

      schema @link(url: "https://specs.graphql-mesh.com/core/v0.2") {
        query: Query
      }

      type Query {
        hello: String
      }
    `);
    expect(() =>
      getTransportEntryMapUsingFusionAndFederationDirectives(bad),
    ).toThrow(/unsupported Mesh spec "core" version v0\.2/);
  });

  it('merges native schema @transport over join__graph url defaults', () => {
    const schema = buildSchema(/* GraphQL */ `
      directive @transport(
        subgraph: String
        kind: String
        location: String
        options: transport__Options
      ) repeatable on SCHEMA
      directive @join__graph(name: String!, url: String) on ENUM_VALUE

      scalar transport__Options

      enum join__Graph {
        API @join__graph(name: "api", url: "http://from-join")
      }

      schema
        @transport(
          subgraph: "api"
          kind: "http"
          location: "http://from-transport"
          options: { timeout: 5 }
        ) {
        query: Query
      }

      type Query {
        hello: String
      }
    `);

    const map = getTransportEntryMapUsingFusionAndFederationDirectives(schema);
    expect(map['api']).toMatchObject({
      subgraph: 'api',
      kind: 'http',
      location: 'http://from-transport',
    });
    expect(map['api']?.options).toEqual({ timeout: 5 });
    expect(getDirectiveExtensions(schema)?.['transport']?.length).toBe(1);
  });
});
