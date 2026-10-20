import { setTimeout } from 'timers/promises';
import { normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { isAsyncIterable } from '@graphql-tools/utils';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';

describe('batch-delegate with @defer', () => {
  it('batches deferred User fields from multiple posts into one fetch', async () => {
    let batchCalls = 0;
    const users = [
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Alan' },
    ];
    const postsSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Post {
          id: ID!
          author: User
        }
        type User {
          id: ID!
        }
        type Query {
          posts: [Post]
        }
      `,
      resolvers: {
        Query: {
          posts: () => [
            { id: 'p1', author: { id: '1' } },
            { id: 'p2', author: { id: '2' } },
            { id: 'p3', author: { id: '1' } },
          ],
        },
      },
    });
    const usersSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          name: String
        }
        type Query {
          users(ids: [ID!]!): [User]!
        }
      `,
      resolvers: {
        Query: {
          users: async (_: unknown, { ids }: { ids: string[] }) => {
            batchCalls += 1;
            await setTimeout(60);
            return ids.map((id) => users.find((u) => u.id === id) ?? null);
          },
        },
      },
    });

    const schema = stitchSchemas({
      subschemas: [
        { schema: postsSchema },
        {
          schema: usersSchema,
          batch: true,
          merge: {
            User: {
              selectionSet: '{ id }',
              fieldName: 'users',
              key: ({ id }: { id: string }) => id,
              argsFromKeys: (ids: readonly string[]) => ({ ids }),
            },
          },
        },
      ],
    });

    const result = await normalizedExecutor({
      schema,
      document: parse(/* GraphQL */ `
        query {
          posts {
            id
            author {
              id
              ... @defer {
                name
              }
            }
          }
        }
      `),
    });

    expect(isAsyncIterable(result)).toBe(true);
    const values: unknown[] = [];
    for await (const value of result as AsyncIterable<unknown>) {
      values.push(value);
    }
    expect(values[0]).toMatchObject({
      data: {
        posts: [
          { id: 'p1', author: { id: '1' } },
          { id: 'p2', author: { id: '2' } },
          { id: 'p3', author: { id: '1' } },
        ],
      },
      hasNext: true,
    });
    // All deferred name fetches should coalesce into a single batch
    expect(batchCalls).toBe(1);
    const names = values
      .flatMap((v: any) => v.incremental ?? [])
      .map((inc: any) => inc.data?.name)
      .filter(Boolean);
    expect(new Set(names)).toEqual(new Set(['Ada', 'Alan']));
  });
});
