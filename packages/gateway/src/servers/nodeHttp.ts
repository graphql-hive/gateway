import { promises as fsPromises } from 'node:fs';
import type { Server } from 'node:http';
import type { SecureContextOptions } from 'node:tls';
import type { GatewayRuntime } from '@graphql-hive/gateway-runtime';
import type { Extra } from 'graphql-ws/lib/use/ws';
import { defaultOptions } from '../cli';
import { getGraphQLWSOptions } from './graphqlWs';
import type { ServerForRuntimeOptions } from './types';

export async function startNodeHttpServer<TContext extends Record<string, any>>(
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
    requestTimeout,
  } = opts;
  let server: Server;
  let protocol: string;

  if (sslCredentials) {
    protocol = 'https';
    const sslOptionsForNodeHttp: SecureContextOptions = {};
    if (sslCredentials.ca_file_name) {
      sslOptionsForNodeHttp.ca = await fsPromises.readFile(
        sslCredentials.ca_file_name,
      );
    }
    if (sslCredentials.cert_file_name) {
      sslOptionsForNodeHttp.cert = await fsPromises.readFile(
        sslCredentials.cert_file_name,
      );
    }
    if (sslCredentials.dh_params_file_name) {
      sslOptionsForNodeHttp.dhparam = await fsPromises.readFile(
        sslCredentials.dh_params_file_name,
      );
    }
    if (sslCredentials.key_file_name) {
      sslOptionsForNodeHttp.key = await fsPromises.readFile(
        sslCredentials.key_file_name,
      );
    }
    if (sslCredentials.passphrase) {
      sslOptionsForNodeHttp.passphrase = sslCredentials.passphrase;
    }
    if (sslCredentials.ssl_ciphers) {
      sslOptionsForNodeHttp.ciphers = sslCredentials.ssl_ciphers;
    }
    if (sslCredentials.ssl_prefer_low_memory_usage) {
      sslOptionsForNodeHttp.honorCipherOrder = true;
    }
    const { createServer } = await import('node:https');
    server = createServer(
      {
        ...sslOptionsForNodeHttp,
        maxHeaderSize,
        requestTimeout,
      },
      gwRuntime,
    );
  } else {
    protocol = 'http';
    const { createServer } = await import('node:http');
    server = createServer(
      {
        maxHeaderSize,
        requestTimeout,
      },
      gwRuntime,
    );
  }

  const url = `${protocol}://${host}:${port}`.replace('0.0.0.0', 'localhost');

  log.debug(`Starting server on ${url}`);
  if (!disableWebsockets) {
    log.debug('Setting up WebSocket server');
    const { WebSocketServer } = await import('ws');
    const wsServer = new WebSocketServer({
      path: gwRuntime.graphqlEndpoint,
      server,
    });
    const { useServer } = await import('graphql-ws/lib/use/ws');

    useServer(
      getGraphQLWSOptions<TContext, Extra>(gwRuntime, (ctx) => ({
        req: ctx.extra?.request,
        socket: ctx.extra?.socket,
      })),
      wsServer,
    );

    gwRuntime.disposableStack.defer(
      () =>
        new Promise<void>((resolve, reject) => {
          log.info(`Stopping the WebSocket server`);
          wsServer.close((err) => {
            if (err) {
              return reject(err);
            }
            log.info(`Stopped the WebSocket server successfully`);
            return resolve();
          });
        }),
    );
  }
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      log.info(`Listening on ${url}`);
      gwRuntime.disposableStack.defer(
        () =>
          new Promise<void>((resolve) => {
            process.stderr.write('\n');
            log.info(`Stopping the server`);
            server.closeAllConnections();
            server.close(() => {
              log.info(`Stopped the server successfully`);
              return resolve();
            });
          }),
      );
      return resolve();
    });
  });
}
