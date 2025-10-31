import { setTimeout } from 'timers/promises';
import { LegacyLogger, Logger } from '@graphql-hive/logger';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { getExecutorForUnifiedGraph } from '@graphql-mesh/fusion-runtime';
import {
  createDefaultExecutor,
  type DisposableExecutor,
} from '@graphql-mesh/transport-common';
import { makeDisposable } from '@graphql-mesh/utils';
import { normalizedExecutor } from '@graphql-tools/executor';
import {
  createDeferred,
  fakePromise,
  isAsyncIterable,
} from '@graphql-tools/utils';
import {
  assertSingleExecutionValue,
  usingHiveRouterQueryPlanner,
} from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import {
  DeferredPromise,
  handleMaybePromise,
} from '@whatwg-node/promise-helpers';
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

    function getFetchedTimeOnComment() {
      return handleMaybePromise(
        () => manager.getUnifiedGraph(),
        (schema) => {
          const queryType = schema.getQueryType();
          const lastFetchedDateStr =
            queryType?.description?.match(/Fetched on (.*)/)?.[1];
          if (!lastFetchedDateStr) {
            throw new Error('Fetched date not found');
          }
          const lastFetchedDate = new Date(lastFetchedDateStr);
          return lastFetchedDate;
        },
      );
    }

    function getFetchedTimeFromResolvers() {
      if (usingHiveRouterQueryPlanner()) {
        return handleMaybePromise(
          () => manager.getExecutor(),
          (executor) =>
            handleMaybePromise(
              () =>
                executor!({
                  document: parse(/* GraphQL */ `
                    query {
                      time
                    }
                  `),
                }),
              (result) => {
                if (isAsyncIterable(result)) {
                  throw new Error('Unexpected async iterable');
                }
                return new Date(result.data.time);
              },
            ),
        );
      }
      return handleMaybePromise(
        () => manager.getUnifiedGraph(),
        (schema) =>
          handleMaybePromise(
            () =>
              normalizedExecutor({
                schema,
                document: parse(/* GraphQL */ `
                  query {
                    time
                  }
                `),
              }),
            (result) => {
              if (isAsyncIterable(result)) {
                throw new Error('Unexpected async iterable');
              }
              return new Date(result.data.time);
            },
          ),
      );
    }

    function compareTimes() {
      return handleMaybePromise(
        () => getFetchedTimeOnComment(),
        (timeFromComment) => {
          return handleMaybePromise(
            () => getFetchedTimeFromResolvers(),
            (timeFromResolvers) => {
              expect(timeFromComment).toEqual(timeFromResolvers);
            },
          );
        },
      );
    }

    await compareTimes();
    const firstDate = await getFetchedTimeOnComment();

    await advanceTimersByTimeAsync(pollingInterval);
    await compareTimes();
    const secondDate = await getFetchedTimeOnComment();

    const diffBetweenFirstAndSecond =
      secondDate.getTime() - firstDate.getTime();
    expect(diffBetweenFirstAndSecond).toBeGreaterThanOrEqual(pollingInterval);

    await compareTimes();
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
    await compareTimes();

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
      if (usingHiveRouterQueryPlanner()) {
        const executor = await manager.getExecutor();
        const result = await executor!({
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
    await compareTimes();
    // Should keep polling even if it fails in somewhere
    expect(unifiedGraphFetcher).toHaveBeenCalledTimes(4);
  });
  it('does not stop request if the polled schema is not changed', async () => {
    vi.useFakeTimers?.();
    const schema = createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          greetings(requestDuration: Int): String
        }
      `,
      resolvers: {
        Query: {
          greetings(_, { requestDuration }) {
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
      pollingInterval: 1000,
      transports() {
        return {
          getSubgraphExecutor() {
            return makeDisposable(createDefaultExecutor(schema), disposeFn);
          },
        };
      },
    });
    const results: ExecutionResult[] = [];
    function makeQuery(requestDuration: number) {
      fakePromise(
        executor({
          document: parse(/* GraphQL */ `
            query {
              greetings(requestDuration: ${requestDuration})
            }
          `),
        }),
      ).then(
        (r) => {
          assertSingleExecutionValue(r);
          results.push(r);
          return r;
        },
        (e) => {
          results.push({
            errors: [e],
          });
        },
      );
    }
    makeQuery(10_000);
    await advanceTimersByTimeAsync(10_500);
    makeQuery(0);
    expect(callTimes).toHaveLength(2);
    // It can be 0 or 1 or any one-digit number
    expect(callTimes[0]?.toString()?.length).toBe(1);
    // It can be 10_000 or 10_001 or any five-digit number
    expect(callTimes[1]?.toString()?.length).toBe(5);
  }, 20_000);
  it('does not block incoming requests while polling', async () => {
    // Jest's timer is acting weird
    if (process.env['LEAK_TEST']) {
      vi.useRealTimers?.();
    } else {
      vi.useFakeTimers?.();
    }
    let schema: GraphQLSchema;
    let unifiedGraph: string;
    let graphDeferred: DeferredPromise<string> | undefined;
    function updateGraph() {
      const createdTime = new Date().toISOString();
      schema = createSchema({
        typeDefs: /* GraphQL */ `
          type Query {
            createdTime: String
          }
        `,
        resolvers: {
          Query: {
            createdTime: () => createdTime,
          },
        },
      });
      unifiedGraph = getUnifiedGraphGracefully([
        {
          name: 'Test',
          schema,
        },
      ]);
      return createdTime;
    }
    const firstCreatedTime = updateGraph();
    const unifiedGraphFetcher = vi.fn(() => {
      return graphDeferred ? graphDeferred.promise : unifiedGraph;
    });
    const log = new Logger();
    await using executor = getExecutorForUnifiedGraph({
      getUnifiedGraph: unifiedGraphFetcher,
      pollingInterval: 10_000,
      transportContext: { log, logger: LegacyLogger.from(log) },
      transports() {
        log.debug('transports');
        return {
          getSubgraphExecutor() {
            log.debug('getSubgraphExecutor');
            return function dynamicExecutor(...args) {
              log.debug('dynamicExecutor');
              return createDefaultExecutor(schema)(...args);
            };
          },
        };
      },
    });
    const firstRes = await executor({
      document: parse(/* GraphQL */ `
        query {
          createdTime
        }
      `),
    });
    expect(firstRes).toEqual({
      data: {
        createdTime: firstCreatedTime,
      },
    });
    expect(unifiedGraphFetcher).toHaveBeenCalledTimes(1);
    graphDeferred = createDeferred();
    const timeout$ = new Promise<void>((resolve) => {
      globalThis.setTimeout(() => {
        resolve();
      }, 10_000);
    });
    await advanceTimersByTimeAsync(10_000);
    await timeout$;
    const secondRes = await executor({
      document: parse(/* GraphQL */ `
        query {
          createdTime
        }
      `),
    });
    expect(secondRes).toEqual({
      data: {
        createdTime: firstCreatedTime,
      },
    });
    expect(unifiedGraphFetcher).toHaveBeenCalledTimes(2);
    const secondFetchTime = updateGraph();
    graphDeferred.resolve(unifiedGraph!);
    const thirdRes = await executor({
      document: parse(/* GraphQL */ `
        query {
          createdTime
        }
      `),
    });
    expect(thirdRes).toEqual({
      data: {
        createdTime: secondFetchTime,
      },
    });
  }, 30_000);
});
