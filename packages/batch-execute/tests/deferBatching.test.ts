import { setTimeout } from 'timers/promises';
import { executorFromSchema } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { ExecutionResult, isAsyncIterable } from '@graphql-tools/utils';
import { parse, print } from 'graphql';
import { describe, expect, it } from 'vitest';
import { createBatchingExecutor } from '../src/createBatchingExecutor.js';
import { getBatchingExecutor } from '../src/getBatchingExecutor.js';

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

  it('merges @stream items when draining multi-request incremental batches', async () => {
    async function* streamedBatch() {
      yield {
        data: {
          _v0_letters: ['a'],
          _v1_ok: 'yes',
        },
        hasNext: true,
      };
      yield {
        incremental: [{ path: ['_v0_letters', 1], items: ['b'] }],
        hasNext: true,
      };
      yield {
        incremental: [{ path: ['_v0_letters', 2], items: ['c'] }],
        hasNext: false,
      };
    }

    const executor = createBatchingExecutor(
      () => streamedBatch() as AsyncIterable<ExecutionResult>,
      undefined,
      undefined,
      true,
    );

    const [lettersResult, okResult] = await Promise.all([
      executor({
        document: parse(/* GraphQL */ `
          query {
            letters
          }
        `),
        variables: {},
      }),
      executor({
        document: parse(/* GraphQL */ `
          query {
            ok
          }
        `),
        variables: {},
      }),
    ]);

    expect(lettersResult).toEqual({ data: { letters: ['a', 'b', 'c'] } });
    expect(okResult).toEqual({ data: { ok: 'yes' } });
  });

  it('getBatchingExecutor caches defer:true separately from defer:false', async () => {
    let seenDeferWrap = false;
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
            await setTimeout(40);
            return 'slow';
          },
        },
      },
    });
    const base = executorFromSchema(schema);
    const wrapped: typeof base = (req) => {
      // mergeRequests with defer:true wraps root selections in @defer
      if (print(req.document).includes('@defer')) {
        seenDeferWrap = true;
      }
      return base(req);
    };
    const ctx = {};
    // Warm non-defer first — must not be reused when defer:true is requested.
    const plain = getBatchingExecutor(
      ctx,
      wrapped,
      undefined,
      undefined,
      false,
    );
    const deferred = getBatchingExecutor(
      ctx,
      wrapped,
      undefined,
      undefined,
      true,
    );
    expect(deferred).not.toBe(plain);
    expect(getBatchingExecutor(ctx, wrapped, undefined, undefined, true)).toBe(
      deferred,
    );

    const [fastResult, slowResult] = await Promise.all([
      deferred({
        document: parse(`query { fast }`),
        variables: {},
      }),
      deferred({
        document: parse(`query { slow }`),
        variables: {},
      }),
    ]);

    expect(seenDeferWrap).toBe(true);
    expect(fastResult).toEqual({ data: { fast: 'fast' } });
    expect(slowResult).toEqual({ data: { slow: 'slow' } });
  });
});
