import {
  GatewayRuntime,
  getGraphQLWSOptions,
} from '@graphql-hive/gateway-runtime';
import { Extra } from 'graphql-ws/use/uWebSockets';
import type { TemplatedApp } from 'uWebSockets.js';
import { defaultOptions } from '../cli';
import { ServerForRuntimeOptions } from './types';

export function createUWSStartFn(uws: typeof import('uWebSockets.js')) {
  return async function startUwsServer<TContext extends Record<string, any>>(
    gwRuntime: GatewayRuntime<TContext>,
    opts: ServerForRuntimeOptions,
  ): Promise<void> {
    const {
      log,
      host = defaultOptions.host,
      port = defaultOptions.port,
      sslCredentials,
      maxHeaderSize,
      disableWebsockets,
    } = opts;

    if (maxHeaderSize) {
      process.env['UWS_HTTP_MAX_HEADER_SIZE'] = maxHeaderSize.toString();
    }

    let app: TemplatedApp;
    let protocol: string;

    if (sslCredentials) {
      protocol = 'https';
      app = uws.SSLApp({
        key_file_name: sslCredentials.key_file_name,
        cert_file_name: sslCredentials.cert_file_name,
        ca_file_name: sslCredentials.ca_file_name,
        passphrase: sslCredentials.passphrase,
        dh_params_file_name: sslCredentials.dh_params_file_name,
        ssl_ciphers: sslCredentials.ssl_ciphers,
        ssl_prefer_low_memory_usage: sslCredentials.ssl_prefer_low_memory_usage,
      });
    } else {
      protocol = 'http';
      app = uws.App();
    }

    const url = `${protocol}://${host}:${port}`.replace('0.0.0.0', 'localhost');
    log.debug(`Starting server on ${url}`);

    if (!disableWebsockets) {
      log.debug('Setting up WebSocket server');
      const { makeBehavior } = await import('graphql-ws/use/uWebSockets');

      const wsBehavior = makeBehavior(
        getGraphQLWSOptions<TContext, Extra>(gwRuntime, (ctx) => ({
          req: ctx.extra?.persistedRequest,
          socket: ctx.extra?.socket,
        })),
      );

      app.ws(gwRuntime.graphqlEndpoint, wsBehavior);
    }

    app.any('/*', gwRuntime);

    return new Promise((resolve, reject) => {
      app.listen(host, port, (listenSocket) => {
        if (listenSocket) {
          log.info(`Listening on ${url}`);
        } else {
          reject(new Error(`Failed to start server on ${url}`));
        }
      });
      gwRuntime.disposableStack.defer(() => {
        log.info(`Stopping the server`);
        app.close();
        resolve();
      });
    });
  };
}
