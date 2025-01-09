import { setTimeout } from 'timers/promises';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { getExecutorForUnifiedGraph } from '@graphql-mesh/fusion-runtime';
import { createDefaultExecutor, type DisposableExecutor } from '@graphql-mesh/transport-common';
import { makeDisposable } from '@graphql-mesh/utils';
import { normalizedExecutor } from '@graphql-tools/executor';
import { fakePromise, isAsyncIterable } from '@graphql-tools/utils';
import { assertSingleExecutionValue } from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { ExecutionResult, GraphQLSchema, parse } from 'graphql';
import { createSchema } from 'graphql-yoga';
import { describe, expect, it, vi } from 'vitest';
import { UnifiedGraphManager } from '../src/unifiedGraphManager';

describe('Polling', () => {
  const advanceTimersByTimeAsync = vi.advanceTimersByTimeAsync || setTimeout;
  it('polls the schema in a certain interval', async () => {
    vi.useFakeTimers?.();
    const pollingInterval = 300;
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
    const disposeFn = vi.fn();
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
    await advanceTimersByTimeAsync(pollingInterval);
    await compareTimes();
    const secondDate = await getFetchedTimeOnComment();
    const diffBetweenFirstAndSecond =
      secondDate.getTime() - firstDate.getTime();
    expect(diffBetweenFirstAndSecond).toBeGreaterThanOrEqual(pollingInterval);
    await advanceTimersByTimeAsync(pollingInterval);
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
    vi.useFakeTimers?.();
    const pollingInterval = 300;
    let schema: GraphQLSchema;
    let shouldFail = true;
    const unifiedGraphFetcher = vi.fn(() => {
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
    try {
      await manager.getUnifiedGraph();
      expect(true).toBeFalsy();
    } catch (e) {
      // Ignore
    }
    shouldFail = false;
    await advanceTimersByTimeAsync(pollingInterval);
    await compareTimes();
    shouldFail = true;
    await advanceTimersByTimeAsync(pollingInterval);
    // Should not fail again once it has succeeded
    await compareTimes();
    await advanceTimersByTimeAsync(pollingInterval);
    // Should keep polling even if it fails in somewhere
    expect(unifiedGraphFetcher).toHaveBeenCalledTimes(4);
  });
  const requestDuration = 10_000;
  const pollingInterval = 1000;
  it('does not stop request if the polled schema is not changed', async () => {
    vi.useFakeTimers?.();
    const schema = createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          greetings: String
        }
      `,
      resolvers: {
        Query: {
          greetings() {
            return new Promise<string>((resolve) => {
              globalThis.setTimeout(() => {
                resolve('Hello');
              }, requestDuration);
            });
          },
        },
      },
    });
    const callTimes: number[] = [];
    const startTime = Date.now();
    const unifiedGraphFetcher = vi.fn(() => {
      callTimes.push(Date.now() - startTime);
      return getUnifiedGraphGracefully([
        {
          name: 'Test',
          schema,
        },
      ]);
    });
    let disposeFn = vi.fn();
    await using executor = getExecutorForUnifiedGraph({
      getUnifiedGraph: unifiedGraphFetcher,
      pollingInterval,
      transports() {
        return {
          getSubgraphExecutor() {
            return makeDisposable(createDefaultExecutor(schema), disposeFn);
          },
        };
      },
    });
    let result: ExecutionResult | undefined;
    let err: Error | undefined;
    fakePromise(
      executor({
        document: parse(/* GraphQL */ `
          query {
            greetings
          }
        `),
      }),
    ).then(
      (r) => {
        assertSingleExecutionValue(r);
        result = r;
        return r;
      },
      (e) => {
        err = e;
      },
    );
    let totalTimeLeft = requestDuration;
    await advanceTimersByTimeAsync(pollingInterval * 2);
    totalTimeLeft -= pollingInterval * 2;
    // After twice polling interval, the request should be still pending
    expect(result).toBeUndefined();
    expect(err).toBeUndefined();
    expect(callTimes[0]).toBeLessThanOrEqual(1);
    expect(Math.floor(callTimes[1]! / pollingInterval)).toBe(1);
    await advanceTimersByTimeAsync(totalTimeLeft + pollingInterval);
    expect(result).toEqual({
      data: {
        greetings: 'Hello',
      },
    });
    expect(disposeFn).toHaveBeenCalledTimes(0);
    expect(callTimes).toHaveLength(
      Math.floor(requestDuration / pollingInterval) + 1,
    );
  }, requestDuration * 2);
});