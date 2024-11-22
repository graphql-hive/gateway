import type {
  TransportEntry,
  TransportGetSubgraphExecutorOptions,
} from '@graphql-mesh/transport-common';
import {
  DefaultLogger,
  dispose,
  makeAsyncDisposable,
  makeDisposable,
} from '@graphql-mesh/utils';
import { buildGraphQLWSExecutor } from '@graphql-tools/executor-graphql-ws';
import { DisposableAsyncExecutor, ExecutionResult } from '@graphql-tools/utils';
import { parse } from 'graphql';
import { beforeEach, describe, expect, it, MockedFunction, vi } from 'vitest';
import wsTransport, { type WSTransportOptions } from '../src';

describe('WS Transport', () => {
  let buildExecutorMock: MockedFunction<typeof buildGraphQLWSExecutor>;
  beforeEach(() => {
    vi.clearAllMocks();
    buildExecutorMock = vi.fn<typeof buildGraphQLWSExecutor>(
      function (): DisposableAsyncExecutor {
        return function mockExecutor(): ExecutionResult {
          return { data: null };
        } as unknown as DisposableAsyncExecutor;
      },
    );
  });

  it('should forward connection params', async () => {
    const executor = makeExecutor({
      options: {
        connectionParams: { 'x-test': '{context.token}' },
      },
    });

    await executor({ document, context: { token: 'test' } });

    expect(buildExecutorMock).toHaveBeenCalledTimes(1);
    expect(buildExecutorMock.mock.calls[0]?.[0]).toMatchObject({
      connectionParams: { 'x-test': 'test' },
    });
  });

  it('should forward headers', async () => {
    const executor = makeExecutor({
      headers: [['x-test', '{context.token}']],
    });

    await executor({ document, context: { token: 'test' } });

    expect(buildExecutorMock).toHaveBeenCalledTimes(1);
    expect(buildExecutorMock.mock.calls[0]?.[0]).toMatchObject({
      headers: { 'x-test': 'test' },
    });
  });

  it('should reuse websocket executor based on connection params and headers', async () => {
    const executor = makeExecutor({
      options: {
        connectionParams: {
          token: '{context.token}',
        },
      },
    });

    await executor({ document, context: { token: 'test1' } });

    await executor({ document, context: { token: 'test2' } });

    await executor({ document, context: { token: 'test2' } });

    expect(buildExecutorMock).toHaveBeenCalledTimes(2);
  });

  it('should reuse websocket executor based on headers', async () => {
    const executor = makeExecutor({
      headers: [['x-test', '{context.token}']],
    });

    await executor({ document, context: { token: 'test1' } });

    await executor({ document, context: { token: 'test2' } });

    await executor({ document, context: { token: 'test2' } });

    expect(buildExecutorMock).toHaveBeenCalledTimes(2);
  });

  it('should reuse websocket executor based on both headers and connectionParams', async () => {
    const executor = makeExecutor({
      headers: [['x-test', '{context.headers}']],
      options: {
        connectionParams: {
          test: '{context.connectionParams}',
        },
      },
    });

    await executor({
      document,
      context: { connectionParams: 'test1', headers: 'test1' },
    });

    await executor({
      document,
      context: { connectionParams: 'test2', headers: 'test1' },
    });

    await executor({
      document,
      context: { connectionParams: 'test1', headers: 'test2' },
    });

    await executor({
      document,
      context: { connectionParams: 'test2', headers: 'test2' },
    });

    await executor({
      document,
      context: { connectionParams: 'test1', headers: 'test1' },
    });

    expect(buildExecutorMock).toHaveBeenCalledTimes(4);
  });

  it('should cleanup executors on connection closed', async () => {
    const executor = makeExecutor();

    await executor({ document });
    // @ts-ignore
    buildExecutorMock.mock.lastCall[0].on.closed();
    await executor({ document });

    expect(buildExecutorMock).toHaveBeenCalledTimes(2);
  });

  it('should dispose async', async () => {
    const executor = makeExecutor({
      options: { connectionParams: { test: '{context.test}' } },
    });
    async function mockExecutor(): Promise<ExecutionResult> {
      return { data: null };
    }

    const asyncDisposeMock = vi.fn().mockReturnValue(Promise.resolve());
    buildExecutorMock.mockImplementationOnce(() =>
      makeAsyncDisposable(mockExecutor, asyncDisposeMock),
    );
    await executor({ document, context: { test: '2' } });

    await dispose(executor);
    expect(asyncDisposeMock).toHaveBeenCalled();
  });
  it('should dispose sync', async () => {
    const executor = makeExecutor({
      options: { connectionParams: { test: '{context.test}' } },
    });
    function mockExecutor(): ExecutionResult {
      return { data: null };
    }

    const syncDisposeMock = vi.fn();
    buildExecutorMock.mockImplementationOnce(
      // @ts-expect-error - wrong typings for sync dispose
      () => makeDisposable(mockExecutor, syncDisposeMock),
    );
    await executor({ document, context: { test: '2' } });

    await dispose(executor);
    expect(syncDisposeMock).toHaveBeenCalled();
  });
  function makeExecutor(
    transportEntry?: Partial<TransportEntry<WSTransportOptions>>,
  ) {
    return wsTransport.getSubgraphExecutor(
      {
        transportEntry: {
          location: 'http://localhost/ws',
          ...transportEntry,
        },
        logger: new DefaultLogger(),
      } as unknown as TransportGetSubgraphExecutorOptions<WSTransportOptions>,
      buildExecutorMock,
    );
  }

  const document = parse(/* GraphQL */ `
    subscription {
      test
    }
  `);
});
