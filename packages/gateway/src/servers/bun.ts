import {
  DisposableSymbols,
  getGraphQLWSOptions,
} from '@graphql-hive/gateway-runtime';
import type { Server, ServerWebSocket, WebSocketOptions } from 'bun';
import { defaultOptions, GatewayRuntime } from '..';
import type { ServerForRuntimeOptions } from './types';

type WebSocketData = {
  request: Request;
};

type BunExtra = {
  socket: ServerWebSocket<WebSocketData>;
};

export async function startBunServer<TContext extends Record<string, any>>(
  gwRuntime: GatewayRuntime<TContext>,
  opts: ServerForRuntimeOptions,
): Promise<void> {
  const serverOptions: Bun.Serve.Options<{}> & Partial<WebSocketOptions> = {
    fetch: gwRuntime,
    port: opts.port || defaultOptions.port,
    hostname: opts.host || defaultOptions.host,
    reusePort: true,
    idleTimeout: opts.requestTimeout,
  };
  if (opts.sslCredentials) {
    const tlsOptions: Bun.TLSOptions = {};
    if (opts.sslCredentials.ca_file_name) {
      tlsOptions.ca = Bun.file(opts.sslCredentials.ca_file_name);
    }
    if (opts.sslCredentials.cert_file_name) {
      tlsOptions.cert = Bun.file(opts.sslCredentials.cert_file_name);
    }
    if (opts.sslCredentials.dh_params_file_name) {
      tlsOptions.dhParamsFile = opts.sslCredentials.dh_params_file_name;
    }
    if (opts.sslCredentials.key_file_name) {
      tlsOptions.key = Bun.file(opts.sslCredentials.key_file_name);
    }
    if (opts.sslCredentials.passphrase) {
      tlsOptions.passphrase = opts.sslCredentials.passphrase;
    }
    if (opts.sslCredentials.ssl_ciphers) {
      // TODO: Check if there is a correct way to set ciphers
    }
    if (opts.sslCredentials.ssl_prefer_low_memory_usage) {
      tlsOptions.lowMemoryMode =
        opts.sslCredentials.ssl_prefer_low_memory_usage;
    }
    serverOptions.tls = tlsOptions;
  }
  if (!opts.disableWebsockets) {
    const { makeHandler } = await import('graphql-ws/use/bun');
    serverOptions.websocket = makeHandler(
      getGraphQLWSOptions<TContext, BunExtra>(gwRuntime, (ctx) => ({
        socket: ctx.extra.socket,
        ...ctx.extra.socket.data,
      })),
    );
    serverOptions.fetch = function (
      request: Request,
      server: Server<WebSocketData>,
    ) {
      // header to check if websocket
      if (
        request.headers.has('Sec-WebSocket-Key') &&
        server.upgrade(request, {
          data: {
            request,
          },
        })
      ) {
        // This is how Bun docs say to handle websockets but types are not correct
        return undefined as unknown as Response;
      }
      return gwRuntime.handleRequest(request, server);
    };
  }
  const server = Bun.serve(serverOptions);
  opts.log.info(`Listening on ${server.url}`);
  gwRuntime.disposableStack.defer(() => server[DisposableSymbols.dispose]());
}
