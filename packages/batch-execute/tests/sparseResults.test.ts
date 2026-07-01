import { createBatchingExecutor } from '@graphql-tools/batch-execute';
import { normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { ExecutionResult, Executor } from '@graphql-tools/utils';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';

// Regression test for DataLoader throwing
// "did not return a Promise of an Array" when a batched response omits some of
// the merged sub-requests.
//
// `splitResult` builds `new Array(numResults)` and only fills the indices that
// appear in the merged response's `data`/`errors`. A real subgraph can answer
// only some of the batched operations (returning neither a data key nor a
// path-scoped error for the others), leaving holes. If the *last* index is a
// hole, the array has a hole at `length - 1`: it passes `Array.isArray` but
// fails DataLoader's stricter `isArrayLike` check, so the batching executor's
// DataLoader throws.
describe('sparse batch results', () => {
  const schema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        field1: String
        field2: String
      }
    `,
    resolvers: {
      Query: {
        field1: () => '1',
        field2: () => '2',
      },
    },
  });

  // Executor that drops the highest-indexed merged sub-request's keys from the
  // response, simulating a subgraph that only answers some of the batched
  // operations. This leaves a hole at the trailing slot of `splitResult`.
  const lossyExecutor: Executor = async ({ document }) => {
    const result = (await normalizedExecutor({
      schema,
      document,
    })) as ExecutionResult;

    if (result.data) {
      const indices = Object.keys(result.data)
        .map((key) => Number(/^_v(\d+)_/.exec(key)?.[1]))
        .filter((n) => !Number.isNaN(n));
      const maxIndex = Math.max(...indices);
      for (const key of Object.keys(result.data)) {
        if (new RegExp(`^_v${maxIndex}_`).test(key)) {
          delete result.data[key];
        }
      }
    }

    return result;
  };

  it('does not throw when the trailing batched request is omitted', async () => {
    const batchExec = createBatchingExecutor(lossyExecutor);

    const [first, second] = (await Promise.all([
      batchExec({ document: parse('{ field1 }') }),
      batchExec({ document: parse('{ field2 }') }),
    ])) as ExecutionResult[];

    // The answered slice resolves normally; the omitted (trailing) slice yields
    // an empty result instead of throwing a DataLoader error.
    expect(first?.data).toEqual({ field1: '1' });
    expect(second?.data ?? {}).toEqual({});
  });
});
