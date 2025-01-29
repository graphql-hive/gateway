import { process } from '@graphql-mesh/cross-helpers';
import { getInterpolatedHeadersFactory } from '@graphql-mesh/string-interpolation';
import {
  type DisposableExecutor,
  type Transport,
} from '@graphql-mesh/transport-common';
import {
  dispose,
  isDisposable,
  makeAsyncDisposable,
} from '@graphql-mesh/utils';
import { buildGraphQLWSExecutor } from '@graphql-tools/executor-graphql-ws';
import { createClient } from 'graphql-ws';
import { WebSocket } from 'isomorphic-ws';

function switchProtocols(url: string) {
  if (url.startsWith('https://')) {
    return url.replace('https://', 'wss://');
  }
  if (url.startsWith('http://')) {
    return url.replace('http://', 'ws://');
  }
  return url;
}

export interface WSTransportOptions {
  /**
   * Interpolated additional parameters, passed through the `payload` field with the `ConnectionInit` message,
   * that the client specifies when establishing a connection with the server. You can use this
   * for securely passing arguments for authentication.
   */
  connectionParams?: Record<string, string>;
}

export default {
  getSubgraphExecutor(
    { transportEntry, logger },
    buildExecutor = buildGraphQLWSExecutor,
  ) {
    const wsExecutorMap = new Map<string, DisposableExecutor>();
    if (!transportEntry.location) {
      throw new Error(
        'WS Transport: location is required in the transport entry',
      );
    }
    const wsUrl = switchProtocols(transportEntry.location);
    const connectionParamsFactory = transportEntry.options?.connectionParams
      ? getInterpolatedHeadersFactory(transportEntry.options.connectionParams)
      : undefined;
    const headersFactory = transportEntry.headers
      ? getInterpolatedHeadersFactory(
          Object.fromEntries(transportEntry.headers),
        )
      : undefined;

    const mergedExecutor: DisposableExecutor = function mergedExecutor(
      execReq,
    ) {
      const connectionParams = connectionParamsFactory?.({
        env: process.env as Record<string, string>,
        root: execReq.rootValue,
        context: execReq.context,
        info: execReq.info,
      });
      const headers = headersFactory?.({
        env: process.env as Record<string, string>,
        root: execReq.rootValue,
        context: execReq.context,
        info: execReq.info,
      });

      const hash = JSON.stringify({ wsUrl, connectionParams, headers });

      let wsExecutor = wsExecutorMap.get(hash);
      if (!wsExecutor) {
        const executorLogger = logger?.child('GraphQL WS').child(hash);
        wsExecutor = buildExecutor(
          createClient({
            webSocketImpl: headers
              ? class WebSocketWithHeaders extends WebSocket {
                  constructor(url: string, protocol: string) {
                    super(url, protocol, { headers });
                  }
                }
              : WebSocket,
            url: wsUrl,
            lazy: true,
            lazyCloseTimeout: 3_000,
            ...transportEntry.options,
            connectionParams,
            on: {
              connecting(isRetry) {
                executorLogger?.debug('connecting', { isRetry });
              },
              opened(socket) {
                executorLogger?.debug('opened', { socket });
              },
              connected(socket, payload) {
                executorLogger?.debug('connected', { socket, payload });
              },
              ping(received, payload) {
                executorLogger?.debug('ping', { received, payload });
              },
              pong(received, payload) {
                executorLogger?.debug('pong', { received, payload });
              },
              message(message) {
                executorLogger?.debug('message', { message });
              },
              closed(event) {
                executorLogger?.debug('closed', { event });
                // no subscriptions and the lazy close timeout has passed - remove the client
                wsExecutorMap.delete(hash);
              },
              error(error) {
                executorLogger?.debug('error', { error });
              },
            },
          }),
        );
        wsExecutorMap.set(hash, wsExecutor);
      }
      return wsExecutor(execReq);
    };
    return makeAsyncDisposable(mergedExecutor, () =>
      Promise.all(
        Array.from(wsExecutorMap.values()).map(
          (executor) => isDisposable(executor) && dispose(executor),
        ),
      ).then(() => {}),
    );
  },
} satisfies Transport<WSTransportOptions>;
