import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import {
  assertSome,
  createGraphQLError,
  ExecutionResult,
} from '@graphql-tools/utils';
import { graphql, GraphQLSchema } from 'graphql';
import { describe, expect, it, test } from 'vitest';

describe('merge failures', () => {
  const firstSchema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Thing {
        id: ID!
        name: String!
      }
      type Query {
        thing(id: ID!): Thing
      }
    `,
    resolvers: {
      Query: {
        thing: (_root, { id }) => ({ id, name: 'The Thing' }),
      },
    },
  });

  const getGatewaySchema = (secondSchema: GraphQLSchema): GraphQLSchema =>
    stitchSchemas({
      subschemas: [
        {
          schema: firstSchema,
          merge: {
            Thing: {
              selectionSet: '{ id }',
              fieldName: 'thing',
              args: ({ id }) => ({ id }),
            },
          },
        },
        {
          schema: secondSchema,
          merge: {
            Thing: {
              selectionSet: '{ id }',
              fieldName: '_thing',
              args: ({ id }) => ({ id }),
            },
          },
        },
      ],
    });

  it('proxies merged errors', async () => {
    const secondSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Thing {
          id: ID!
          description: String!
        }
        type Query {
          _thing(id: ID!): Thing
        }
      `,
      resolvers: {
        Query: {
          _thing: () => new Error('unable to produce the thing'),
        },
      },
    });

    const gatewaySchema = getGatewaySchema(secondSchema);

    const result = await graphql({
      schema: gatewaySchema,
      source: /* GraphQL */ `
        query {
          thing(id: 23) {
            id
            name
            description
          }
        }
      `,
    });

    const expectedResult: ExecutionResult = {
      data: { thing: null },
      errors: [
        createGraphQLError('unable to produce the thing', {
          path: ['thing', 'description'],
        }),
      ],
    };

    expect(result).toEqual(expectedResult);
  });

  test('proxies merged error arrays', async () => {
    const schema1 = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Thing {
          id: ID!
          name: String
          desc: String
        }
        type Query {
          things(ids: [ID!]!): [Thing]!
        }
      `,
      resolvers: {
        Query: {
          things: () => [new Error('no thing')],
        },
      },
    });

    const schema2 = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type ParentThing {
          thing: Thing
        }
        type Thing {
          id: ID!
        }
        type Query {
          parent: ParentThing
        }
      `,
      resolvers: {
        Query: {
          parent: () => ({ thing: { id: 23 } }),
        },
      },
    });

    const stitchedSchema = stitchSchemas({
      subschemas: [
        {
          schema: schema1,
          merge: {
            Thing: {
              selectionSet: '{ id }',
              fieldName: 'things',
              key: ({ id }) => id,
              argsFromKeys: (ids) => ({ ids }),
            },
          },
        },
        {
          schema: schema2,
        },
      ],
    });

    const stitchedResult = await graphql({
      schema: stitchedSchema,
      source: '{ parent { thing { name desc id } } }',
    });
    assertSome(stitchedResult.errors);
    expect(stitchedResult.errors[0]?.path).toEqual(['parent', 'thing', 'name']);
  });

  it('proxies inappropriate null', async () => {
    const secondSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Thing {
          id: ID!
          description: String!
        }
        type Query {
          _thing(id: ID!): Thing
        }
      `,
      resolvers: {
        Query: {
          _thing: () => null,
        },
      },
    });

    const gatewaySchema = getGatewaySchema(secondSchema);

    const result = await graphql({
      schema: gatewaySchema,
      source: /* GraphQL */ `
        query {
          thing(id: 23) {
            id
            name
            description
          }
        }
      `,
    });

    expect(result).toMatchObject({
      data: { thing: null },
      errors: [
        {
          message:
            'Cannot return null for non-nullable field Thing.description.',
          path: ['thing', 'description'],
        },
      ],
    });
  });

  it('proxies errors on object', async () => {
    const secondSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Thing {
          id: ID!
          description: String!
        }
        type Query {
          _thing(id: ID!): Thing
        }
      `,
      resolvers: {
        Query: {
          _thing: () => ({}),
        },
      },
    });

    const gatewaySchema = getGatewaySchema(secondSchema);

    const result = await graphql({
      schema: gatewaySchema,
      source: /* GraphQL */ `
        query {
          thing(id: 23) {
            id
            name
            description
          }
        }
      `,
    });

    expect(result).toMatchObject({
      data: { thing: null },
      errors: [
        {
          message:
            'Cannot return null for non-nullable field Thing.description.',
          path: ['thing', 'description'],
          locations: [{ line: 6, column: 13 }],
        },
      ],
    });
  });
});

describe('nullable merging', () => {
  test('works for asymmetric record sets', async () => {
    const users = [
      { id: '1', username: 'hanshotfirst' },
      { id: '2', username: 'bigvader23' },
      { id: '3', username: 'yodamecrazy' },
    ];

    const usersSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          username: String!
        }
        type Query {
          users(ids: [ID!]!): [User]!
        }
      `,
      resolvers: {
        Query: {
          users: (_root, { ids }) =>
            ids.map((id: string) => users.find((u) => u.id === id)),
        },
      },
    });

    const appUserSettings = [
      { id: '1', user_id: '1', appSetting1: 'yes', appSetting2: true },
      { id: '2', user_id: '3', appSetting1: 'no', appSetting2: false },
    ];

    const appSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          appSetting1: String
          appSetting2: Boolean
        }
        type Query {
          _users(ids: [ID!]!): [User]!
        }
      `,
      resolvers: {
        Query: {
          _users: (_root, { ids }) =>
            ids.map((id: string) => {
              const userSettings = appUserSettings.find(
                (u) => u.user_id === id,
              );
              return userSettings ? { ...userSettings, id } : null;
            }),
        },
      },
    });

    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema: usersSchema,
          merge: {
            User: {
              selectionSet: '{ id }',
              fieldName: 'users',
              key: ({ id }) => id,
              argsFromKeys: (ids) => ({ ids }),
            },
          },
        },
        {
          schema: appSchema,
          merge: {
            User: {
              selectionSet: '{ id }',
              fieldName: '_users',
              key: ({ id }) => id,
              argsFromKeys: (ids) => ({ ids }),
            },
          },
        },
      ],
    });

    const result = await graphql({
      schema: gatewaySchema,
      source: /* GraphQL */ `
        query {
          users(ids: [1, 2, 3]) {
            id
            username
            appSetting1
            appSetting2
          }
        }
      `,
    });

    const expectedResult = {
      data: {
        users: [
          {
            id: '1',
            username: 'hanshotfirst',
            appSetting1: 'yes',
            appSetting2: true,
          },
          {
            id: '2',
            username: 'bigvader23',
            appSetting1: null,
            appSetting2: null,
          },
          {
            id: '3',
            username: 'yodamecrazy',
            appSetting1: 'no',
            appSetting2: false,
          },
        ],
      },
    };

    expect(result).toEqual(expectedResult);
  });
});

/**
 * When a merged field is only reachable via a merge key that nothing ever
 * produces, leftover resolution used to return a deferred promise that never
 * settled and the request hung idle. After leftover work drains, that deferred
 * must be rejected so the query completes with a field error instead.
 */
describe('leftover work-queue drain', () => {
  it('settles unresolvable leftover fields instead of hanging', async () => {
    const usersSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          name: String!
        }
        type Query {
          user(id: ID!): User
        }
      `,
      resolvers: {
        Query: {
          user: (_root, { id }) => ({ id, name: 'Ada' }),
        },
      },
    });

    // Nullable bio so a field error does not null-bubble the whole User.
    const profilesSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          email: ID!
          bio: String
        }
        type Query {
          _userByEmail(email: ID!): User
        }
      `,
      resolvers: {
        Query: {
          _userByEmail: (_root, { email }) => ({ email, bio: 'hello' }),
        },
      },
    });

    const gateway = stitchSchemas({
      subschemas: [
        {
          name: 'users',
          schema: usersSchema,
          merge: {
            User: {
              selectionSet: '{ id }',
              fieldName: 'user',
              args: ({ id }) => ({ id }),
            },
          },
        },
        {
          name: 'profiles',
          schema: profilesSchema,
          merge: {
            User: {
              // Reachable only via email, which no subschema ever produces.
              selectionSet: '{ email }',
              fieldName: '_userByEmail',
              args: ({ email }) => ({ email }),
            },
          },
        },
      ],
    });

    const result = await Promise.race([
      graphql({
        schema: gateway,
        source: /* GraphQL */ `
          query {
            user(id: "1") {
              id
              name
              bio
            }
          }
        `,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                'TIMED OUT: leftover deferred was not settled by work-queue drain',
              ),
            ),
          2000,
        ),
      ),
    ]);

    expect(result.data).toEqual({
      user: {
        id: '1',
        name: 'Ada',
        bio: null,
      },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]!.extensions?.['code']).toBe(
      'SATISFIABILITY_ERROR',
    );
    expect(result.errors![0]!.path).toEqual(['user', 'bio']);
    expect(result.errors![0]!.message).toBe(
      [
        'The following field cannot be satisfied by the subschemas:',
        '{',
        '  user {',
        '    bio',
        '  }',
        '}',
        'because:',
        '- from subschema "users":',
        '  - cannot find field "User.bio".',
        '  - cannot move to subschema "profiles" using key fields { email } of "User"; the key field(s) cannot be resolved from subschema "users".',
      ].join('\n'),
    );
  });

  it('still resolves reachable merged fields', async () => {
    const usersSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          name: String!
          email: ID!
        }
        type Query {
          user(id: ID!): User
        }
      `,
      resolvers: {
        Query: {
          user: (_root, { id }) => ({
            id,
            name: 'Ada',
            email: 'ada@example.com',
          }),
        },
      },
    });

    const profilesSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          email: ID!
          bio: String!
        }
        type Query {
          _userByEmail(email: ID!): User
        }
      `,
      resolvers: {
        Query: {
          _userByEmail: (_root, { email }) => ({ email, bio: 'hello' }),
        },
      },
    });

    const gateway = stitchSchemas({
      subschemas: [
        {
          schema: usersSchema,
          merge: {
            User: {
              selectionSet: '{ id }',
              fieldName: 'user',
              args: ({ id }) => ({ id }),
            },
          },
        },
        {
          schema: profilesSchema,
          merge: {
            User: {
              selectionSet: '{ email }',
              fieldName: '_userByEmail',
              args: ({ email }) => ({ email }),
            },
          },
        },
      ],
    });

    const result = await graphql({
      schema: gateway,
      source: /* GraphQL */ `
        query {
          user(id: "1") {
            id
            name
            bio
          }
        }
      `,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      user: {
        id: '1',
        name: 'Ada',
        bio: 'hello',
      },
    });
  });
});
