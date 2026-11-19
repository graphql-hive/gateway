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
import { isBrowser } from '~internal/env';
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
  // per-execution connectionParams get their own client so callers never share an authenticated socket
  // shortcut: clients are kept until dispose, one per distinct extensions.connectionParams, evict them if that ever grows unbounded
  const clientsByConnectionParams = new Map<string, Client>();
  let getClient = (_extensionsConnectionParams?: Record<string, unknown>) =>
    graphqlWSClient;
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
            } else {
              super(url, {
                // we pass both protocols and protocol to satisfy different implementations
                // @ts-expect-error rest of environments supporting native WebSocket (Deno, Bun, Node 22+)
                protocols: [protocol],
                protocol,
                headers,
              });
            }
          }
        }
      : WebSocket;

    const clientOptions = clientOptionsOrClient;
    const createWSClient = (
      extensionsConnectionParams?: Record<string, unknown>,
    ) => {
      const client = createClient({
        url: clientOptions.url,
        webSocketImpl,
        lazy: clientOptions.lazy !== false,
        lazyCloseTimeout: clientOptions.lazyCloseTimeout || 0,
        connectionParams: () => ({
          ...(typeof clientOptions.connectionParams === 'function'
            ? clientOptions.connectionParams()
            : clientOptions.connectionParams),
          ...extensionsConnectionParams,
        }),
        on: clientOptions.on,
      });
      if (clientOptions.onClient) {
        clientOptions.onClient(client);
      }
      return client;
    };
    graphqlWSClient = createWSClient();
    getClient = (extensionsConnectionParams) => {
      if (!extensionsConnectionParams) {
        return graphqlWSClient;
      }
      const key = JSON.stringify(extensionsConnectionParams);
      let client = clientsByConnectionParams.get(key);
      if (!client) {
        client = createWSClient({ ...extensionsConnectionParams });
        clientsByConnectionParams.set(key, client);
      }
      return client;
    };
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
    const extensionsConnectionParams =
      extensions?.['connectionParams'] &&
      typeof extensions?.['connectionParams'] === 'object'
        ? extensions['connectionParams']
        : undefined;
    const iterableIterator = getClient(extensionsConnectionParams).iterate<
      TData,
      TExtensions
    >(serializeExecutionRequest({ executionRequest, printFn }));
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
      const clients = [graphqlWSClient, ...clientsByConnectionParams.values()];
      clientsByConnectionParams.clear();
      return Promise.all(clients.map((client) => client.dispose())).then(
        () => {},
      );
    },
  });
  return executor as DisposableAsyncExecutor;
}
