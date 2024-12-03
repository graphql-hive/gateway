import type { Server, TLSServeOptions, WebSocketServeOptions } from 'bun';
import type { Extra } from 'graphql-ws/lib/use/bun';
import { defaultOptions, GatewayRuntime } from '..';
import { getGraphQLWSOptions } from './graphqlWs';
import type { ServerForRuntimeOptions } from './types';

export async function startBunServer<TContext extends Record<string, any>>(
  gwRuntime: GatewayRuntime<TContext>,
  opts: ServerForRuntimeOptions,
): Promise<void> {
  const serverOptions: TLSServeOptions & Partial<WebSocketServeOptions> = {
    fetch: gwRuntime,
    port: opts.port || defaultOptions.port,
    hostname: opts.host || defaultOptions.host,
    reusePort: true,
    idleTimeout: opts.requestTimeout,
  };
  if (opts.sslCredentials) {
    if (opts.sslCredentials.ca_file_name) {
      serverOptions.ca = Bun.file(opts.sslCredentials.ca_file_name);
    }
    if (opts.sslCredentials.cert_file_name) {
      serverOptions.cert = Bun.file(opts.sslCredentials.cert_file_name);
    }
    if (opts.sslCredentials.dh_params_file_name) {
      serverOptions.dhParamsFile = opts.sslCredentials.dh_params_file_name;
    }
    if (opts.sslCredentials.key_file_name) {
      serverOptions.key = Bun.file(opts.sslCredentials.key_file_name);
    }
    if (opts.sslCredentials.passphrase) {
      serverOptions.passphrase = opts.sslCredentials.passphrase;
    }
    if (opts.sslCredentials.ssl_ciphers) {
      // TODO: Check if there is a correct way to set ciphers
    }
    if (opts.sslCredentials.ssl_prefer_low_memory_usage) {
      serverOptions.lowMemoryMode =
        opts.sslCredentials.ssl_prefer_low_memory_usage;
    }
  }
  if (!opts.disableWebsockets) {
    const { makeHandler } = await import('graphql-ws/lib/use/bun');
    serverOptions.websocket = makeHandler(
      getGraphQLWSOptions<TContext, Extra>(gwRuntime, (ctx) => ({
        socket: ctx.extra.socket,
        ...(ctx.extra.socket.data || {}),
      })),
    );
    serverOptions.fetch = function (request: Request, server: Server) {
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
  gwRuntime.disposableStack.use(server);
}
