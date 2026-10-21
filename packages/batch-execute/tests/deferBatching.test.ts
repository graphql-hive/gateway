import { setTimeout } from 'timers/promises';
import { executorFromSchema } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { isAsyncIterable } from '@graphql-tools/utils';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { createBatchingExecutor } from '../src/createBatchingExecutor.js';

describe('batch-execute with defer', () => {
  it('passes through a single-request AsyncIterable without draining it', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          fast: String
          slow: String
        }
      `,
      resolvers: {
        Query: {
          fast: () => 'fast',
          slow: async () => {
            await setTimeout(80);
            return 'slow';
          },
        },
      },
    });

    const executor = createBatchingExecutor(
      executorFromSchema(schema),
      undefined,
      undefined,
      true,
    );

    const t0 = Date.now();
    const result = await executor({
      document: parse(/* GraphQL */ `
        query {
          fast
          ... @defer {
            slow
          }
        }
      `),
      variables: {},
    });

    expect(isAsyncIterable(result)).toBe(true);
    const iterator = (result as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(Date.now() - t0).toBeLessThan(60);
    expect(first.value).toMatchObject({
      data: { fast: 'fast' },
      hasNext: true,
    });
    const rest: unknown[] = [];
    for await (const chunk of {
      [Symbol.asyncIterator]: () => iterator,
    }) {
      rest.push(chunk);
    }
    expect(JSON.stringify(rest)).toContain('slow');
  });

  it('wraps batched requests in @defer and still splits results correctly', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          fast: String
          slow: String
        }
      `,
      resolvers: {
        Query: {
          fast: () => 'fast',
          slow: async () => {
            await setTimeout(80);
            return 'slow';
          },
        },
      },
    });

    const executor = createBatchingExecutor(
      executorFromSchema(schema),
      undefined,
      undefined,
      true, // defer
    );

    const [fastResult, slowResult] = await Promise.all([
      executor({
        document: parse(`query { fast }`),
        variables: {},
      }),
      executor({
        document: parse(`query { slow }`),
        variables: {},
      }),
    ]);

    expect(fastResult).toEqual({ data: { fast: 'fast' } });
    expect(slowResult).toEqual({ data: { slow: 'slow' } });
  });
});
