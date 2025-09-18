import {
  defaultPrintFn,
  serializeExecutionRequest,
} from '@graphql-tools/executor-common';
import {
  DisposableAsyncExecutor,
  ExecutionRequest,
  getOperationASTFromRequest,
} from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { getNodeVer, isBrowser } from '~internal/env';
import type { DocumentNode } from 'graphql';
import {
  createClient,
  EventClosedListener,
  EventConnectedListener,
  EventConnectingListener,
  EventErrorListener,
  EventMessageListener,
  EventOpenedListener,
  EventPingListener,
  EventPongListener,
  type Client,
} from 'graphql-ws';
import { WebSocket } from 'isows';

export interface GraphQLWSExecutorOptions {
  print?(doc: DocumentNode): string;
  /** The URL of the WebSocket server to connect to. */
  url: string;
  /**
   * Additional headers to include with the upgrade request.
   * It will never be sent again during the lifecycle of the socket.
   *
   * Warning: This is a noop in browser environments
   */
  headers?: Record<string, string>;
  /**
   * Optional parameters, passed through the `payload` field with the `ConnectionInit` message,
   * that the client specifies when establishing a connection with the server. You can use this
   * for securely passing arguments for authentication.
   */
  connectionParams?: Record<string, unknown> | (() => Record<string, unknown>);
  /**
   * How to establish the connection to the server, on-demand or eagerly.
   *
   * @default true
   */
  lazy?: boolean;
  /**
   * How long should the client wait before closing the socket after the last operation has
   * completed. This is meant to be used in combination with `lazy`. You might want to have
   * a calmdown time before actually closing the connection. Kinda' like a lazy close "debounce".
   *
   * @default 0
   */
  lazyCloseTimeout?: number;

  /**
   * Do not use this option unless you know what you are doing.
   * @internal
   */
  on?:
    | Partial<{
        error: EventErrorListener;
        message: EventMessageListener;
        connecting: EventConnectingListener;
        opened: EventOpenedListener;
        connected: EventConnectedListener;
        ping: EventPingListener;
        pong: EventPongListener;
        closed: EventClosedListener;
      }>
    | undefined;

  /**
   * Do not use this option unless you know what you are doing.
   * @internal
   */
  onClient?: (client: Client) => void;
}

function isClient(client: Client | GraphQLWSExecutorOptions): client is Client {
  return 'subscribe' in client;
}

export function buildGraphQLWSExecutor(
  clientOptionsOrClient: GraphQLWSExecutorOptions | Client,
): DisposableAsyncExecutor {
  let graphqlWSClient: Client;
  let executorConnectionParams = {};
  let printFn = defaultPrintFn;
  if (isClient(clientOptionsOrClient)) {
    graphqlWSClient = clientOptionsOrClient;
  } else {
    if (clientOptionsOrClient.print) {
      printFn = clientOptionsOrClient.print;
    }

    const headers = clientOptionsOrClient.headers;
    const webSocketImpl = headers
      ? class WebSocketWithHeaders extends WebSocket {
          constructor(url: string, protocol: string) {
            if (isBrowser()) {
              // browser
              super(url, protocol);
            } else if (getNodeVer().major < 22) {
              super(
                url,
                protocol,
                // @ts-expect-error will require('ws') and headers are passed like this
                { headers },
              );
            } else {
              super(
                url,
                // @ts-expect-error rest of environments supporting native WebSocket (Deno, Bun, Node 22+)
                { protocols: protocol, headers },
              );
            }
          }
        }
      : WebSocket;

    graphqlWSClient = createClient({
      url: clientOptionsOrClient.url,
      webSocketImpl,
      lazy: clientOptionsOrClient.lazy !== false,
      lazyCloseTimeout: clientOptionsOrClient.lazyCloseTimeout || 0,
      connectionParams: () => {
        const optionsConnectionParams =
          (typeof clientOptionsOrClient.connectionParams === 'function'
            ? clientOptionsOrClient.connectionParams()
            : clientOptionsOrClient.connectionParams) || {};
        return Object.assign(optionsConnectionParams, executorConnectionParams);
      },
      on: clientOptionsOrClient.on,
    });
    if (clientOptionsOrClient.onClient) {
      clientOptionsOrClient.onClient(graphqlWSClient);
    }
  }
  const executor = function GraphQLWSExecutor<
    TData,
    TArgs extends Record<string, any>,
    TRoot,
    TExtensions extends Record<string, any>,
  >(executionRequest: ExecutionRequest<TArgs, any, TRoot, TExtensions>) {
    const {
      extensions,
      operationType = getOperationASTFromRequest(executionRequest).operation,
      info,
      signal = info?.signal,
    } = executionRequest;
    // additional connection params can be supplied through the "connectionParams" field in extensions.
    // TODO: connection params only from the FIRST operation in lazy mode will be used (detect connectionParams changes and reconnect, too implicit?)
    if (
      extensions?.['connectionParams'] &&
      typeof extensions?.['connectionParams'] === 'object'
    ) {
      executorConnectionParams = Object.assign(
        executorConnectionParams,
        extensions['connectionParams'],
      );
    }
    const iterableIterator = graphqlWSClient.iterate<TData, TExtensions>(
      serializeExecutionRequest({ executionRequest, printFn }),
    );
    if (iterableIterator.return && signal) {
      signal.addEventListener(
        'abort',
        () => {
          iterableIterator.return?.();
        },
        { once: true },
      );
    }
    if (operationType === 'subscription') {
      return iterableIterator;
    }
    return iterableIterator.next().then(({ value }) => value);
  };
  Object.defineProperty(executor, DisposableSymbols.asyncDispose, {
    value: function disposeWS() {
      return graphqlWSClient.dispose();
    },
  });
  return executor as DisposableAsyncExecutor;
}
