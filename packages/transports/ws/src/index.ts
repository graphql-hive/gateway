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
import type { Client } from 'graphql-ws';

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
    { transportEntry, log: rootLog },
    /**
     * Do not use this option unless you know what you are doing.
     * @internal
     */
    onClient?: (client: Client) => void,
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
        const log = rootLog.child({
          executor: 'GraphQL WS',
          wsUrl,
          connectionParams,
          headers,
        });
        wsExecutor = buildGraphQLWSExecutor({
          headers,
          url: wsUrl,
          lazy: true,
          lazyCloseTimeout: 3_000,
          ...transportEntry.options,
          connectionParams,
          on: {
            connecting(isRetry) {
              log.debug({ isRetry }, 'connecting');
            },
            opened(socket) {
              log.debug({ socket }, 'opened');
            },
            connected(socket, payload) {
              log.debug({ socket, payload }, 'connected');
            },
            ping(received, payload) {
              log.debug({ received, payload }, 'ping');
            },
            pong(received, payload) {
              log.debug({ received, payload }, 'pong');
            },
            message(message) {
              log.debug({ message }, 'message');
            },
            closed(event) {
              log.debug({ event }, 'closed');
              // no subscriptions and the lazy close timeout has passed - remove the client
              wsExecutorMap.delete(hash);
            },
            error(error) {
              log.debug({ error }, 'error');
            },
          },
          onClient,
        });
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
