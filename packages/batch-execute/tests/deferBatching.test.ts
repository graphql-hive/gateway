import { setTimeout } from 'timers/promises';
import { executorFromSchema } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { createBatchingExecutor } from '../src/createBatchingExecutor.js';

describe('batch-execute with defer', () => {
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
