import type {
  TransportEntry,
  TransportGetSubgraphExecutorOptions,
} from '@graphql-mesh/transport-common';
import { DefaultLogger, dispose } from '@graphql-mesh/utils';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { createDisposableWebSocketServer } from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { parse } from 'graphql';
import { ServerOptions } from 'graphql-ws';
import { Extra, useServer } from 'graphql-ws/use/ws';
import { describe, expect, it, vi } from 'vitest';
import wsTransport, { type WSTransportOptions } from '../src';

type TServerOptions = ServerOptions<{}, Extra>;

async function createTServer(
  transportEntry?: Partial<TransportEntry<WSTransportOptions>>,
  opts?: TServerOptions,
) {
  const schema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        hello: String!
      }
    `,
    resolvers: {
      Query: {
        hello: () => 'world',
      },
    },
  });

  const ws = await createDisposableWebSocketServer();

  const onConnectFn = vi.fn<NonNullable<TServerOptions['onConnect']>>();

  useServer({ schema, onConnect: onConnectFn, ...opts }, ws.server);

  const executor = wsTransport.getSubgraphExecutor({
    transportEntry: {
      location: ws.url,
      ...transportEntry,
    },
    logger: new DefaultLogger(),
  } as unknown as TransportGetSubgraphExecutorOptions<WSTransportOptions>);

  return {
    onConnectFn,
    executor,
    executeHelloQuery(context?: Record<string, unknown>) {
      return executor({
        document: parse('{hello}'),
        context,
      });
    },
    [DisposableSymbols.asyncDispose]() {
      return ws[DisposableSymbols.asyncDispose]();
    },
  };
}

describe('WS Transport', () => {
  it('should forward connection params', async () => {
    await using serv = await createTServer({
      options: {
        connectionParams: { 'x-test': '{context.token}' },
      },
    });

    await serv.executeHelloQuery({ token: 'test' });

    expect(serv.onConnectFn).toBeCalledTimes(1);
    expect(serv.onConnectFn.mock.calls[0]![0].connectionParams).toEqual({
      'x-test': 'test',
    });
  });

  it('should forward headers', async () => {
    await using serv = await createTServer({
      headers: [['x-test', '{context.token}']],
    });

    await serv.executeHelloQuery({ token: 'test' });

    expect(serv.onConnectFn).toHaveBeenCalledTimes(1);
    expect(serv.onConnectFn.mock.calls[0]![0].extra.request).toMatchObject({
      headers: {
        'x-test': 'test',
      },
    });
  });

  it('should reuse websocket based on connection params', async () => {
    await using serv = await createTServer({
      options: {
        connectionParams: {
          token: '{context.token}',
        },
      },
    });

    await serv.executeHelloQuery({ token: 'test1' });

    await serv.executeHelloQuery({ token: 'test2' });

    await serv.executeHelloQuery({ token: 'test2' });

    expect(serv.onConnectFn).toHaveBeenCalledTimes(2);
  });

  it('should reuse websocket based on headers', async () => {
    await using serv = await createTServer({
      headers: [['x-test', '{context.token}']],
    });

    await serv.executeHelloQuery({ token: 'test1' });

    await serv.executeHelloQuery({ token: 'test2' });

    await serv.executeHelloQuery({ token: 'test2' });

    expect(serv.onConnectFn).toHaveBeenCalledTimes(2);
  });

  it('should reuse websocket executor based on both headers and connectionParams', async () => {
    await using serv = await createTServer({
      headers: [['x-test', '{context.headers}']],
      options: {
        connectionParams: {
          test: '{context.connectionParams}',
        },
      },
    });

    await serv.executeHelloQuery({
      connectionParams: 'test1',
      headers: 'test1',
    });

    await serv.executeHelloQuery({
      connectionParams: 'test2',
      headers: 'test1',
    });

    await serv.executeHelloQuery({
      connectionParams: 'test1',
      headers: 'test2',
    });

    await serv.executeHelloQuery({
      connectionParams: 'test2',
      headers: 'test2',
    });

    await serv.executeHelloQuery({
      connectionParams: 'test1',
      headers: 'test1',
    });

    expect(serv.onConnectFn).toHaveBeenCalledTimes(4);
  });

  it('should create new executor on connection closed', async () => {
    await using serv = await createTServer();

    await serv.executeHelloQuery();

    expect(serv.onConnectFn).toBeCalledTimes(1);
    serv.onConnectFn.mock.calls[0]![0].extra.socket.close();

    await serv.executeHelloQuery();

    expect(serv.onConnectFn).toBeCalledTimes(2);
  });

  it('should dispose async', async () => {
    await using serv = await createTServer();

    const asyncDisposeFn = vi.spyOn(
      serv.executor,
      DisposableSymbols.asyncDispose,
    );

    await dispose(serv.executor);

    expect(asyncDisposeFn).toHaveBeenCalled();
  });
});
