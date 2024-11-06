import { createAsyncDisposable } from '@graphql-mesh/utils';
import { TLSServeOptions, WebSocketServeOptions } from 'bun';
import { defaultOptions, GatewayRuntime } from '..';
import { getGraphQLWSOptions } from './graphqlWs';
import { ServerForRuntimeOptions } from './types';

export async function startBunServer<TContext extends Record<string, any>>(
  gwRuntime: GatewayRuntime<TContext>,
  opts: ServerForRuntimeOptions,
): Promise<AsyncDisposable> {
  const serverOptions: TLSServeOptions & Partial<WebSocketServeOptions> = {
    fetch: gwRuntime,
    port: opts.port || defaultOptions.port,
    hostname: opts.host || defaultOptions.host,
    reusePort: true,
  };
  let protocol = 'http';
  if (opts.sslCredentials) {
    protocol = 'https';
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
    const wsOptions = getGraphQLWSOptions(gwRuntime);
    serverOptions.websocket = makeHandler(wsOptions);
  }
  const server = Bun.serve(serverOptions);
  opts.log.info(`Listening on ${server.url}`);
  return createAsyncDisposable(() => {
    process.stderr.write('\n');
    opts.log.info(`Stopping the server`);
    return server.stop(true).then(
      () => {
        opts.log.info(`Stopped the server successfully`);
      },
      (err) => {
        opts.log.error('Error while stopping the server: ', err);
      },
    );
  });
}
