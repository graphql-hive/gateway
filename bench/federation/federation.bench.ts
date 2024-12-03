import { normalizedExecutor } from '@graphql-tools/executor';
import { mapMaybePromise } from '@graphql-tools/utils';
import { createExampleSetup } from '@internal/e2e';
import { benchConfig } from '@internal/testing';
import { getOperationAST, parse, printSchema } from 'graphql';
import { bench, describe, expect } from 'vitest';
import apolloGateway from './apollo';
import monolith from './monolith';
import stitching from './stitching';

function memoize1<T extends (...args: any) => any>(fn: T): T {
  const memoize1cache = new Map();
  return function memoized(a1: Parameters<T>[0]): ReturnType<T> {
    const cachedValue = memoize1cache.get(a1);
    if (cachedValue === undefined) {
      const newValue = fn(a1);
      memoize1cache.set(a1, newValue);
      return newValue;
    }

    return cachedValue;
  } as T;
}

describe('Federation', async () => {
  const { query, operationName, result } = createExampleSetup(__dirname);
  const monolithParse = memoize1(parse);

  // Only if you want to see the latency that the gateway adds
  bench.skip(
    'Monolith',
    () =>
      normalizedExecutor({
        schema: monolith,
        document: monolithParse(query),
        operationName: operationName,
        contextValue: {},
      }) as Promise<void>,
  );

  const apolloParse = memoize1(parse);

  const getOperationASTMemoized = memoize1(getOperationAST);
  const printSchemaMemoized = memoize1(printSchema);

  const apolloGWResult = await apolloGateway.load();

  bench(
    'Apollo Gateway',
    () => {
      const document = apolloParse(query);
      return mapMaybePromise(
        apolloGWResult.executor({
          document,
          operationName: 'TestQuery',
          request: {
            query: query,
          },
          operation: getOperationASTMemoized(document, operationName)!,
          metrics: {} as any,
          overallCachePolicy: undefined as any,
          schemaHash: printSchemaMemoized(apolloGWResult.schema) as any,
          queryHash: query,
          source: query,
          cache: {
            get: async () => undefined,
            set: async () => {},
            delete: async () => true,
          },
          schema: apolloGWResult.schema,
          logger: console,
          context: {},
        }),
        (response) => {
          expect(response).toEqual(result);
        },
      ) as Promise<void>;
    },
    benchConfig,
  );

  const stitchingSchema = await stitching;
  const stitchingParse = memoize1(parse);

  bench(
    'Stitching',
    () =>
      mapMaybePromise(
        normalizedExecutor({
          schema: stitchingSchema,
          document: stitchingParse(query),
          operationName: operationName,
          contextValue: {},
        }),
        (response) => {
          expect(response).toEqual(result);
        },
      ) as Promise<void>,
    benchConfig,
  );
});
