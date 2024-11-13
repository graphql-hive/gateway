import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import {
  createDefaultExecutor,
  type DisposableExecutor,
} from '@graphql-mesh/transport-common';
import { normalizedExecutor } from '@graphql-tools/executor';
import { isAsyncIterable } from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { GraphQLSchema, parse } from 'graphql';
import { createSchema } from 'graphql-yoga';
import { describe, expect, it, vitest } from 'vitest';
import { UnifiedGraphManager } from '../src/unifiedGraphManager';

describe('Polling', () => {
  it('polls the schema in a certain interval', async () => {
    vitest.useFakeTimers();
    const pollingInterval = 35_000;
    let schema: GraphQLSchema;
    const unifiedGraphFetcher = () => {
      const time = new Date().toISOString();
      schema = createSchema({
        typeDefs: /* GraphQL */ `
          """
          Fetched on ${time}
          """
          type Query {
            time: String
          }
        `,
        resolvers: {
          Query: {
            time() {
              return time;
            },
          },
        },
      });
      return getUnifiedGraphGracefully([
        {
          name: 'Test',
          schema,
        },
      ]);
    };
    const disposeFn = vitest.fn();
    await using manager = new UnifiedGraphManager({
      getUnifiedGraph: unifiedGraphFetcher,
      pollingInterval: pollingInterval,
      batch: false,
      transports() {
        return {
          getSubgraphExecutor() {
            const executor: DisposableExecutor = createDefaultExecutor(schema);
            Object.defineProperty(executor, DisposableSymbols.asyncDispose, {
              value: disposeFn,
            });
            return executor;
          },
        };
      },
    });
    async function getFetchedTimeOnComment() {
      const schema = await manager.getUnifiedGraph();
      const queryType = schema.getQueryType();
      const lastFetchedDateStr =
        queryType?.description?.match(/Fetched on (.*)/)?.[1];
      if (!lastFetchedDateStr) {
        throw new Error('Fetched date not found');
      }
      const lastFetchedDate = new Date(lastFetchedDateStr);
      return lastFetchedDate;
    }
    async function getFetchedTimeFromResolvers() {
      const schema = await manager.getUnifiedGraph();
      const result = await normalizedExecutor({
        schema,
        document: parse(/* GraphQL */ `
          query {
            time
          }
        `),
      });
      if (isAsyncIterable(result)) {
        throw new Error('Unexpected async iterable');
      }
      return new Date(result.data.time);
    }
    async function compareTimes() {
      const timeFromComment = await getFetchedTimeOnComment();
      const timeFromResolvers = await getFetchedTimeFromResolvers();
      expect(timeFromComment).toEqual(timeFromResolvers);
    }
    await compareTimes();
    const firstDate = await getFetchedTimeOnComment();
    vitest.advanceTimersByTime(pollingInterval);
    await compareTimes();
    const secondDate = await getFetchedTimeOnComment();
    const diffBetweenFirstAndSecond =
      secondDate.getTime() - firstDate.getTime();
    expect(diffBetweenFirstAndSecond).toBeGreaterThanOrEqual(pollingInterval);
    vitest.advanceTimersByTime(pollingInterval);
    await compareTimes();
    const thirdDate = await getFetchedTimeOnComment();
    const diffBetweenSecondAndThird =
      thirdDate.getTime() - secondDate.getTime();
    expect(diffBetweenSecondAndThird).toBeGreaterThanOrEqual(pollingInterval);
    const diffBetweenFirstAndThird = thirdDate.getTime() - firstDate.getTime();
    expect(diffBetweenFirstAndThird).toBeGreaterThanOrEqual(
      pollingInterval * 2,
    );

    // Check if transport executor is disposed per schema change
    expect(disposeFn).toHaveBeenCalledTimes(2);

    await manager[DisposableSymbols.asyncDispose]();
    // Check if transport executor is disposed on global shutdown
    expect(disposeFn).toHaveBeenCalledTimes(3);
  });
  it('continues polling after failing initial fetch', async () => {
    vitest.useFakeTimers();
    const pollingInterval = 35_000;
    let schema: GraphQLSchema;
    let shouldFail = true;
    const unifiedGraphFetcher = vitest.fn(() => {
      if (shouldFail) {
        throw new Error('Failed to fetch schema');
      }
      const time = new Date().toISOString();
      schema = createSchema({
        typeDefs: /* GraphQL */ `
          """
          Fetched on ${time}
          """
          type Query {
            time: String
          }
        `,
        resolvers: {
          Query: {
            time() {
              return time;
            },
          },
        },
      });
      return getUnifiedGraphGracefully([
        {
          name: 'Test',
          schema,
        },
      ]);
    });
    await using manager = new UnifiedGraphManager({
      getUnifiedGraph: unifiedGraphFetcher,
      pollingInterval: pollingInterval,
      batch: false,
      transports() {
        return {
          getSubgraphExecutor() {
            return createDefaultExecutor(schema);
          },
        };
      },
    });
    async function getFetchedTimeOnComment() {
      const schema = await manager.getUnifiedGraph();
      const queryType = schema.getQueryType();
      if (!queryType) {
        throw new Error('Query type not found');
      }
      const lastFetchedDateStr =
        queryType.description?.match(/Fetched on (.*)/)?.[1];
      if (!lastFetchedDateStr) {
        throw new Error('Fetched date not found');
      }
      const lastFetchedDate = new Date(lastFetchedDateStr);
      return lastFetchedDate;
    }
    async function getFetchedTimeFromResolvers() {
      const schema = await manager.getUnifiedGraph();
      const result = await normalizedExecutor({
        schema,
        document: parse(/* GraphQL */ `
          query {
            time
          }
        `),
      });
      if (isAsyncIterable(result)) {
        throw new Error('Unexpected async iterable');
      }
      return new Date(result.data.time);
    }
    async function compareTimes() {
      const timeFromComment = await getFetchedTimeOnComment();
      const timeFromResolvers = await getFetchedTimeFromResolvers();
      expect(timeFromComment).toEqual(timeFromResolvers);
    }
    await expect(async () => manager.getUnifiedGraph()).rejects.toThrow();
    shouldFail = false;
    vitest.advanceTimersByTime(pollingInterval);
    await compareTimes();
    shouldFail = true;
    vitest.advanceTimersByTime(pollingInterval);
    // Should not fail again once it has succeeded
    await compareTimes();
    vitest.advanceTimersByTime(pollingInterval);
    // Should keep polling even if it fails in somewhere
    expect(unifiedGraphFetcher).toHaveBeenCalledTimes(4);
  });
});
