import { Logger } from '@graphql-hive/logger';
import type {
  TransportEntry,
  TransportGetSubgraphExecutorOptions,
} from '@graphql-mesh/transport-common';
import { dispose } from '@graphql-mesh/utils';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { createDeferred } from '@graphql-tools/utils';
import { createDisposableWebSocketServer } from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { parse } from 'graphql';
import { Client, ServerOptions } from 'graphql-ws';
import { Extra as BunExtra, makeHandler } from 'graphql-ws/use/bun';
import { useServer, Extra as WSExtra } from 'graphql-ws/use/ws';
import { describe, expect, it, vi } from 'vitest';
import wsTransport, { type WSTransportOptions } from '../src';

type TServerOptions = ServerOptions<{}, WSExtra | BunExtra>;

async function createTServer(
  transportEntry?: Partial<TransportEntry<WSTransportOptions>>,
  onClient?: (client: Client) => void,
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

  let url: string;
  let dispose: () => Promise<void>;

  const onConnectFn = vi.fn<NonNullable<TServerOptions['onConnect']>>();
  if (globalThis.Bun) {
    let headers: Record<string, string>;
    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        headers = req.headers.toJSON();
        if (server.upgrade(req)) {
          return; // upgraded
        }
        return new Response('Upgrade failed', { status: 500 });
      },
      websocket: makeHandler({
        schema,
        onConnect(...args) {
          // @ts-expect-error we inject only the headers for testing
          args[0].extra.request = { headers };
          onConnectFn(...args);
        },
      }),
    });
    url = server.url.toString().replace('http', 'ws');
    dispose = () => server.stop(true);
  } else {
    const ws = await createDisposableWebSocketServer();
    useServer({ schema, onConnect: onConnectFn }, ws.server);
    url = ws.url;
    dispose = () => ws[DisposableSymbols.asyncDispose]();
  }

  const options = { ...transportEntry?.options };
  if (process.env['LEAK_TEST']) {
    // @ts-expect-error we disable the lazy close to avoid leaks
    options.lazyCloseTimeout = 0;
  }
  const executor = wsTransport.getSubgraphExecutor(
    {
      transportEntry: {
        location: url,
        ...transportEntry,
        options,
      },
      log: new Logger({ level: false }),
    } as unknown as TransportGetSubgraphExecutorOptions<WSTransportOptions>,
    onClient,
  );

  return {
    onConnectFn,
    executor,
    executeHelloQuery(context?: Record<string, unknown>) {
      return executor({
        document: parse('{hello}'),
        context,
      });
    },
    async [DisposableSymbols.asyncDispose]() {
      await Promise.all([
        dispose(),
        executor[DisposableSymbols.asyncDispose](),
      ]);
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

    expect(serv.onConnectFn).toHaveBeenCalledTimes(1);
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
    expect(
      // @ts-expect-error headers will be injected for testing in bun
      serv.onConnectFn.mock.calls[0]![0].extra.request.headers,
    ).toMatchObject({
      'x-test': 'test',
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

    if (!process.env['LEAK_TEST']) {
      // this assertion leaks, no idea why...
      // we need not test it for leaks anyways, we want to make sure the executor is properly disposed
      expect(serv.onConnectFn).toHaveBeenCalledTimes(2);
    }
  });

  it('should reuse websocket based on headers', async () => {
    await using serv = await createTServer({
      headers: [['x-test', '{context.token}']],
    });

    await serv.executeHelloQuery({ token: 'test1' });

    await serv.executeHelloQuery({ token: 'test2' });

    await serv.executeHelloQuery({ token: 'test2' });

    if (!process.env['LEAK_TEST']) {
      // this assertion leaks, no idea why...
      // we need not test it for leaks anyways, we want to make sure the executor is properly disposed
      expect(serv.onConnectFn).toHaveBeenCalledTimes(2);
    }
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

    if (!process.env['LEAK_TEST']) {
      // this assertion leaks, no idea why...
      // we need not test it for leaks anyways, we want to make sure the executor is properly disposed
      expect(serv.onConnectFn).toHaveBeenCalledTimes(4);
    }
  });

  it('should create new executor after connection closed', async () => {
    let close!: () => void;
    const { promise: waitForClosed, resolve: closed } = createDeferred<void>();

    const onClient = vi.fn((client: Client) => {
      client.on('opened', (socket) => {
        close = () => (socket as WebSocket).close();
      });
      client.on('closed', () => {
        closed();
      });
    });

    await using serv = await createTServer({}, onClient);

    await serv.executeHelloQuery();

    expect(onClient).toHaveBeenCalledTimes(1);

    close();
    await waitForClosed;

    await serv.executeHelloQuery();

    expect(onClient).toHaveBeenCalledTimes(2);
  });

  it.skipIf(
    // jest's spyOn assigns to readonly which does not work with this case
    process.env['LEAK_TEST'],
  )('should dispose async', async () => {
    await using serv = await createTServer();

    const asyncDisposeFn = vi.spyOn(
      serv.executor,
      DisposableSymbols.asyncDispose,
    );

    await dispose(serv.executor);

    expect(asyncDisposeFn).toHaveBeenCalled();
  });
});
