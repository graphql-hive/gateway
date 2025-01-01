import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import {
  createDefaultExecutor,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import {
  execute,
  isIncrementalResult,
  normalizedExecutor,
} from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { Executor } from '@graphql-tools/utils';
import { OperationTypeNode, parse } from 'graphql';
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('non-key arguments are taken into account when memoizing result', () => {
  test('memoizes non-key arguments as part of batch delegation', async () => {
    let numCalls = 0;

    const chirpSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Chirp {
          chirpedAtUserId: ID!
        }
        type Query {
          trendingChirps: [Chirp]
        }
      `,
      resolvers: {
        Query: {
          trendingChirps: () => [
            { chirpedAtUserId: 1 },
            { chirpedAtUserId: 2 },
          ],
        },
      },
    });

    // Mocked author schema
    const authorSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          email: String!
        }
        type Query {
          usersByIds(ids: [ID!], obfuscateEmail: Boolean!): [User]
        }
      `,
      resolvers: {
        Query: {
          usersByIds: (_root, args) => {
            numCalls++;
            return args.ids.map((id: string) => ({
              id,
              email: args.obfuscateEmail ? '***' : `${id}@test.com`,
            }));
          },
        },
      },
    });

    const linkTypeDefs = /* GraphQL */ `
      extend type Chirp {
        chirpedAtUser(obfuscateEmail: Boolean!): User
      }

      extend type User {
        friends(obfuscateEmail: Boolean!): [User]
      }
    `;

    const stitchedSchema = stitchSchemas({
      subschemas: [chirpSchema, authorSchema],
      typeDefs: linkTypeDefs,
      resolvers: {
        Chirp: {
          chirpedAtUser: {
            selectionSet: `{ chirpedAtUserId }`,
            resolve(chirp, args, context, info) {
              return batchDelegateToSchema({
                schema: authorSchema,
                operation: 'query' as OperationTypeNode,
                fieldName: 'usersByIds',
                key: chirp.chirpedAtUserId,
                argsFromKeys: (ids) => ({ ids, ...args }),
                context,
                info,
              });
            },
          },
        },
        User: {
          friends: {
            selectionSet: `{ id }`,
            resolve(user: { id: string }, args, context, info) {
              return batchDelegateToSchema({
                schema: authorSchema,
                operation: 'query' as OperationTypeNode,
                fieldName: 'usersByIds',
                key: user.id === '1' ? ['2', '4'] : ['1', '3'],
                argsFromKeys: (friendIdsList) => {
                  return {
                    ids: [...new Set(friendIdsList.flat())],
                    ...args,
                  };
                },
                context,
                info,
              });
            },
          },
        },
      },
    });

    const query = /* GraphQL */ `
      query {
        trendingChirps {
          withObfuscatedEmail: chirpedAtUser(obfuscateEmail: true) {
            id
            email
            friendsWithoutObfuscatedEmail: friends(obfuscateEmail: false) {
              id
              email
            }
            friendsWithObfuscatedEmail: friends(obfuscateEmail: true) {
              id
              email
            }
          }
          withoutObfuscatedEmail: chirpedAtUser(obfuscateEmail: false) {
            id
            email
            friendsWithoutObfuscatedEmail: friends(obfuscateEmail: false) {
              id
              email
            }
            friendsWithObfuscatedEmail: friends(obfuscateEmail: true) {
              id
              email
            }
          }
        }
      }
    `;

    const result = await execute({
      schema: stitchedSchema,
      document: parse(query),
    });

    // With obfuscateEmail true on root, we expect 2 calls to usersByIds
    // With obfuscateEmail false on root, we expect 2 calls to usersByIds
    // With friends, we have 2 calls like above.
    expect(numCalls).toEqual(4);

    if (isIncrementalResult(result)) throw Error('result is incremental');

    expect(result).toEqual({
      data: {
        trendingChirps: [
          {
            withObfuscatedEmail: {
              id: '1',
              email: '***',
              friendsWithObfuscatedEmail: [
                {
                  id: '2',
                  email: '***',
                },
                {
                  id: '4',
                  email: '***',
                },
              ],
              friendsWithoutObfuscatedEmail: [
                {
                  id: '2',
                  email: '2@test.com',
                },
                {
                  id: '4',
                  email: '4@test.com',
                },
              ],
            },
            withoutObfuscatedEmail: {
              id: '1',
              email: '1@test.com',
              friendsWithObfuscatedEmail: [
                {
                  id: '2',
                  email: '***',
                },
                {
                  id: '4',
                  email: '***',
                },
              ],
              friendsWithoutObfuscatedEmail: [
                {
                  id: '2',
                  email: '2@test.com',
                },
                {
                  id: '4',
                  email: '4@test.com',
                },
              ],
            },
          },
          {
            withObfuscatedEmail: {
              id: '2',
              email: '***',
              friendsWithObfuscatedEmail: [
                {
                  id: '1',
                  email: '***',
                },
                {
                  id: '3',
                  email: '***',
                },
              ],
              friendsWithoutObfuscatedEmail: [
                {
                  id: '1',
                  email: '1@test.com',
                },
                {
                  id: '3',
                  email: '3@test.com',
                },
              ],
            },
            withoutObfuscatedEmail: {
              id: '2',
              email: '2@test.com',
              friendsWithObfuscatedEmail: [
                {
                  id: '1',
                  email: '***',
                },
                {
                  id: '3',
                  email: '***',
                },
              ],
              friendsWithoutObfuscatedEmail: [
                {
                  id: '1',
                  email: '1@test.com',
                },
                {
                  id: '3',
                  email: '3@test.com',
                },
              ],
            },
          },
        ],
      },
    });
  });
  describe('memoizes key arguments as part of batch delegation', () => {
    const users = [
      { id: '1', email: 'john@doe.com', friends: [{ id: '1' }], entity: true },
      { id: '2', email: 'jane@doe.com', friends: [{ id: '2' }], entity: true },
    ];
    const getUsersByIds = vi.fn((ids: string[]) =>
      ids.map((id: string) => users.find((user) => user.id === id)),
    );
    const getArgsFromFriendIds = vi.fn(function (
      friendIdsList: readonly string[][],
    ) {
      return {
        ids: [...new Set(friendIdsList.flat())],
      };
    });
    const getFriendIdsFromUser = vi.fn((user: { friends: typeof users }) =>
      user.friends.map((friend) => friend.id),
    );
    const userSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          email: String!
          friends: [User]
        }
        type Query {
          userById(id: ID!): User
          usersByIds(ids: [ID!]): [User]
        }
      `,
      resolvers: {
        Query: {
          usersByIds: (_root, args) => {
            return getUsersByIds(args.ids);
          },
          userById: (root, args, context, info) => {
            return batchDelegateToSchema({
              schema: userSubschema,
              fieldName: 'usersByIds',
              key: args.id,
              rootValue: root,
              context,
              info,
            });
          },
        },
        User: {
          friends(root: { friends: typeof users }, _args, context, info) {
            return batchDelegateToSchema({
              schema: userSubschema,
              fieldName: 'usersByIds',
              key: getFriendIdsFromUser(root),
              argsFromKeys: getArgsFromFriendIds,
              context,
              info,
            });
          },
        },
      },
    });
    const executorFn = vi.fn(createDefaultExecutor(userSchema));
    const userSubschema: SubschemaConfig = {
      schema: userSchema,
      executor: executorFn as Executor,
    };
    afterEach(() => {
      getUsersByIds.mockClear();
      executorFn.mockClear();
    });
    test('root level', async () => {
      const result = await normalizedExecutor({
        schema: userSchema,
        document: parse(/* GraphQL */ `
          query {
            user1: userById(id: "1") {
              email
            }
            user2: userById(id: "2") {
              email
            }
          }
        `),
      });
      expect(result).toEqual({
        data: {
          user1: { email: 'john@doe.com' },
          user2: { email: 'jane@doe.com' },
        },
      });
      expect(executorFn).toHaveBeenCalledTimes(1);
      expect(getUsersByIds).toHaveBeenCalledTimes(1);
      expect(getUsersByIds).toHaveBeenCalledWith(['1', '2']);
    });
    test('nested level', async () => {
      const result = await normalizedExecutor({
        schema: userSchema,
        document: parse(/* GraphQL */ `
          query {
            user1: userById(id: "1") {
              id
              email
              friends {
                id
                email
                friends {
                  id
                  email
                }
              }
            }
            user2: userById(id: "2") {
              id
              email
              friends {
                id
                email
                friends {
                  id
                  email
                }
              }
            }
          }
        `),
      });
      expect(result).toEqual({
        data: {
          user1: {
            email: 'john@doe.com',
            friends: [
              {
                email: 'john@doe.com',
                friends: [
                  {
                    email: 'john@doe.com',
                    id: '1',
                  },
                ],
                id: '1',
              },
            ],
            id: '1',
          },
          user2: {
            email: 'jane@doe.com',
            friends: [
              {
                email: 'jane@doe.com',
                friends: [
                  {
                    email: 'jane@doe.com',
                    id: '2',
                  },
                ],
                id: '2',
              },
            ],
            id: '2',
          },
        },
      });
      // For each level of the query, we expect a single executor call
      // So we have 3 levels in this query, so we expect 3 executor calls
      expect(executorFn).toHaveBeenCalledTimes(3);
      expect(getUsersByIds).toHaveBeenCalledWith(['1', '2']);
    });
  });
});
