import { setTimeout } from 'timers/promises';
import { executorFromSchema, normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { isAsyncIterable } from '@graphql-tools/utils';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';

function buildPostsUsersSchemas(options?: {
  slowMs?: number;
  onUsersBatch?: (ids: string[]) => void;
}) {
  const slowMs = options?.slowMs ?? 60;
  const users = [
    { id: '1', name: 'Ada', bio: 'mathematician' },
    { id: '2', name: 'Alan', bio: 'computer scientist' },
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
        bio: String
      }
      type Query {
        users(ids: [ID!]!): [User]!
      }
    `,
    resolvers: {
      Query: {
        users: async (_: unknown, { ids }: { ids: string[] }) => {
          options?.onUsersBatch?.(ids);
          await setTimeout(slowMs);
          return ids.map((id) => users.find((u) => u.id === id) ?? null);
        },
      },
      User: {
        bio: async (user: { bio: string }) => {
          await setTimeout(slowMs);
          return user.bio;
        },
      },
    },
  });
  return { postsSchema, usersSchema, users };
}

describe('batch-delegate with @defer', () => {
  it('batches deferred User fields from multiple posts into one fetch', async () => {
    let batchCalls = 0;
    const { postsSchema, usersSchema } = buildPostsUsersSchemas({
      onUsersBatch: () => {
        batchCalls += 1;
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

  it('forwarded defer: batches entity lookups and streams deferred fields', async () => {
    let batchCalls = 0;
    const seenIdBatches: string[][] = [];
    const { postsSchema, usersSchema } = buildPostsUsersSchemas({
      slowMs: 80,
      onUsersBatch: (ids) => {
        batchCalls += 1;
        seenIdBatches.push([...ids].sort());
      },
    });

    const schema = stitchSchemas({
      subschemas: [
        { schema: postsSchema },
        {
          schema: usersSchema,
          defer: true,
          executor: executorFromSchema(usersSchema),
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

    const t0 = Date.now();
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
    const values: Array<{ t: number; v: any }> = [];
    for await (const v of result as AsyncIterable<unknown>) {
      values.push({ t: Date.now() - t0, v });
    }

    expect(values[0]?.v).toMatchObject({
      data: {
        posts: [
          { id: 'p1', author: { id: '1' } },
          { id: 'p2', author: { id: '2' } },
          { id: 'p3', author: { id: '1' } },
        ],
      },
      hasNext: true,
    });
    expect(values[0]!.t).toBeLessThan(70);
    // Forwarded @defer still coalesces distinct entity ids into one batch
    // (a second call may only appear if the runtime splits key vs deferred
    // selection stages; every call must still cover the same id set).
    expect(batchCalls).toBeGreaterThanOrEqual(1);
    expect(batchCalls).toBeLessThanOrEqual(2);
    for (const ids of seenIdBatches) {
      expect(ids).toEqual(['1', '2']);
    }

    const payload = JSON.stringify(values.map((x) => x.v));
    expect(payload).toContain('Ada');
    expect(payload).toContain('Alan');
  });
});
