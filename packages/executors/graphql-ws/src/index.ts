import {
  DisposableAsyncExecutor,
  ExecutionRequest,
  getOperationASTFromRequest,
  memoize1,
} from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { print } from 'graphql';
import { Client, ClientOptions, createClient } from 'graphql-ws';
import WebSocket from 'isomorphic-ws';

const defaultPrintFn = memoize1(print);

interface GraphQLWSExecutorOptions extends ClientOptions {
  onClient?: (client: Client) => void;
  print?: typeof print;
  /**
   * Additional headers to include with the upgrade request.
   * It will never be sent again during the lifecycle of the socket.
   *
   * Warning: This is a noop in browser environments
   */
  headers?: Record<string, string>;
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

    const webSocketImpl = clientOptionsOrClient.headers
      ? class WebSocketWithHeaders extends WebSocket {
          constructor(url: string, protocol: string) {
            super(url, protocol, {
              headers: (clientOptionsOrClient as GraphQLWSExecutorOptions)
                .headers,
            });
          }
        }
      : WebSocket;

    graphqlWSClient = createClient({
      webSocketImpl,
      lazy: true,
      ...clientOptionsOrClient,
      connectionParams: () => {
        const optionsConnectionParams =
          (typeof clientOptionsOrClient.connectionParams === 'function'
            ? clientOptionsOrClient.connectionParams()
            : clientOptionsOrClient.connectionParams) || {};
        return Object.assign(optionsConnectionParams, executorConnectionParams);
      },
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
      document,
      variables,
      operationName,
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
    const query = printFn(document);
    const iterableIterator = graphqlWSClient.iterate<TData, TExtensions>({
      query,
      variables,
      operationName,
      extensions,
    });
    signal?.addEventListener(
      'abort',
      () => {
        iterableIterator.return?.();
      },
      { once: true },
    );
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
