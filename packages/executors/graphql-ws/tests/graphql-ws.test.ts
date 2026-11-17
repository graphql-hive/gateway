import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { buildGraphQLWSExecutor } from '@graphql-tools/executor-graphql-ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { Executor, isAsyncIterable } from '@graphql-tools/utils';
import { assertAsyncIterable } from '@internal/testing';
import { parse } from 'graphql';
import { useServer } from 'graphql-ws/use/ws';
import { Repeater } from 'graphql-yoga';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws'; // yarn add ws

describe('GraphQL WS Executor', () => {
  let server: Server;
  let executor: Executor;
  beforeAll(async () => {
    server = createServer();
    const websocketServer = new WebSocketServer({
      path: '/graphql',
      server,
    });

    useServer(
      {
        schema: makeExecutableSchema({
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
            type Subscription {
              count(to: Int): Int
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'world',
            },
            Subscription: {
              count: {
                subscribe(_, { to }: { to: number }) {
                  return new Repeater((push, stop) => {
                    let i = 0;
                    let closed = false;
                    let timeout: Timer;
                    const pump = async () => {
                      if (closed) {
                        return;
                      }
                      await push({ count: i });
                      if (i++ < to) {
                        timeout = setTimeout(pump, 150);
                      } else {
                        stop();
                      }
                    };
                    stop.then(() => {
                      closed = true;
                      clearTimeout(timeout);
                    });
                    pump();
                  });
                },
              },
            },
          },
        }),
      },
      websocketServer,
    );

    await new Promise<void>((resolve) => server.listen(0, resolve));
    executor = buildGraphQLWSExecutor({
      url: `ws://localhost:${(server.address() as AddressInfo).port}/graphql`,
    });
  });
  afterAll(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  it('should return a promise of an execution result for regular queries', async () => {
    const result = await executor({
      document: parse(/* GraphQL */ `
        query {
          hello
        }
      `),
    });
    if (isAsyncIterable(result)) {
      throw new Error(
        'Expected result to be a promise, but it was an async iterable',
      );
    }
    expect(result).toMatchObject({
      data: {
        hello: 'world',
      },
    });
  });
  it('should return an async iterable of the execution result for subscriptions', async () => {
    const result = await executor({
      document: parse(/* GraphQL */ `
        subscription {
          count(to: 3)
        }
      `),
    });
    if (!isAsyncIterable(result)) {
      throw new Error(
        'Expected result to be an async iterable, but it was a promise',
      );
    }
    const results = [];
    for await (const item of result) {
      results.push(item);
    }
    expect(results).toMatchObject([
      { data: { count: 0 } },
      { data: { count: 1 } },
      { data: { count: 2 } },
      { data: { count: 3 } },
    ]);
  });
  it('should close connections when disposed', async () => {
    const result = await executor({
      document: parse(/* GraphQL */ `
        subscription {
          count(to: 4)
        }
      `),
    });
    assertAsyncIterable(result);
    for await (const item of result) {
      if (item.data?.count === 2) {
        await (executor as any)[Symbol.asyncDispose]();
      }
      if (item.data?.count === 3) {
        throw new Error(
          'Expected connection to be closed before receiving the third item',
        );
      }
    }
  });
});

describe('GraphQL WS Executor connectionParams', () => {
  let server: Server;
  let url: string;
  const connectionInitPayloads: unknown[] = [];
  beforeAll(async () => {
    server = createServer();
    const websocketServer = new WebSocketServer({
      path: '/graphql',
      server,
    });
    useServer(
      {
        schema: makeExecutableSchema({
          typeDefs: /* GraphQL */ `
            type Query {
              token: String
            }
          `,
          resolvers: {
            Query: {
              token: (_, __, ctx) => ctx.connectionParams?.token ?? null,
            },
          },
        }),
        context: (ctx) => ({ connectionParams: ctx.connectionParams }),
        onConnect(ctx) {
          connectionInitPayloads.push(ctx.connectionParams);
        },
      },
      websocketServer,
    );
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `ws://localhost:${(server.address() as AddressInfo).port}/graphql`;
  });
  afterAll(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  beforeEach(() => {
    connectionInitPayloads.length = 0;
  });

  const document = parse(/* GraphQL */ `
    query {
      token
    }
  `);

  it('should not leak connectionParams to later executions', async () => {
    await using executor = buildGraphQLWSExecutor({ url });
    await expect(
      executor({
        document,
        extensions: { connectionParams: { token: 'a', extra: 'x' } },
      }),
    ).resolves.toEqual({ data: { token: 'a' } });
    await expect(executor({ document })).resolves.toEqual({
      data: { token: null },
    });
    await expect(
      executor({
        document,
        extensions: { connectionParams: { token: 'b' } },
      }),
    ).resolves.toEqual({ data: { token: 'b' } });
    expect(connectionInitPayloads).toEqual([
      { token: 'a', extra: 'x' },
      {},
      { token: 'b' },
    ]);
  });

  it('should not mutate options connectionParams', async () => {
    const connectionParams = { token: 'base' };
    await using executor = buildGraphQLWSExecutor({ url, connectionParams });
    await expect(
      executor({
        document,
        extensions: { connectionParams: { token: 'a' } },
      }),
    ).resolves.toEqual({ data: { token: 'a' } });
    expect(connectionParams).toEqual({ token: 'base' });
    await expect(executor({ document })).resolves.toEqual({
      data: { token: 'base' },
    });
    expect(connectionInitPayloads).toEqual([{ token: 'a' }, { token: 'base' }]);
  });

  it('should not share a socket between different connectionParams', async () => {
    await using executor = buildGraphQLWSExecutor({
      url,
      lazyCloseTimeout: 1000,
    });
    await expect(
      executor({
        document,
        extensions: { connectionParams: { token: 'a' } },
      }),
    ).resolves.toEqual({ data: { token: 'a' } });
    await expect(
      executor({
        document,
        extensions: { connectionParams: { token: 'b' } },
      }),
    ).resolves.toEqual({ data: { token: 'b' } });
    await expect(
      executor({
        document,
        extensions: { connectionParams: { token: 'a' } },
      }),
    ).resolves.toEqual({ data: { token: 'a' } });
    expect(connectionInitPayloads).toEqual([{ token: 'a' }, { token: 'b' }]);
  });
});
