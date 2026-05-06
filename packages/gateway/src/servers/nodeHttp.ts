import { promises as fsPromises } from 'node:fs';
import {
  createServer as createHTTPServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import type { SecureContextOptions } from 'node:tls';
import type { GatewayRuntime } from '@graphql-hive/gateway-runtime';
import { getGraphQLWSOptions } from '@graphql-hive/gateway-runtime';
import { normalizeNodeRequest } from '@whatwg-node/server';
import type { Extra } from 'graphql-ws/use/ws';
import { defaultOptions } from '../cli';
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
    requestDeadline,
    keepAliveTimeout,
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
    server = createHTTPSServer(
      {
        ...sslOptionsForNodeHttp,
        maxHeaderSize,
        requestTimeout,
        keepAliveTimeout,
      },
      gwRuntime,
    );
  } else {
    protocol = 'http';
    server = createHTTPServer(
      {
        maxHeaderSize,
        requestTimeout,
        keepAliveTimeout,
      },
      gwRuntime,
    );
  }

  if (requestDeadline) {
    server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      const timer = setTimeout(() => {
        if (!res.headersSent) {
          res.writeHead(503, { Connection: 'close' });
          res.end('Request deadline exceeded', () => {
            // wait for the response to flush before destroying the socket
            req.socket?.destroy();
          });
        } else {
          req.socket?.destroy();
        }
      }, requestDeadline);
      res.once('finish', () => clearTimeout(timer));
      res.once('close', () => clearTimeout(timer));
    });
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
    const { useServer } = await import('graphql-ws/use/ws');

    useServer(
      getGraphQLWSOptions<TContext, Extra>(gwRuntime, (ctx) => ({
        req: ctx.extra.request,
        socket: ctx.extra.socket,
        request: normalizeNodeRequest(ctx.extra.request, gwRuntime.fetchAPI),
      })),
      wsServer,
    );

    gwRuntime.disposableStack.defer(
      () =>
        new Promise<void>((resolve, reject) => {
          log.info('Stopping the WebSocket server');
          wsServer.close((err) => {
            if (err) {
              return reject(err);
            }
            log.info('Stopped the WebSocket server successfully');
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
            log.info('Stopping the server');
            server.closeAllConnections();
            server.close(() => {
              log.info('Stopped the server successfully');
              return resolve();
            });
          }),
      );
      return resolve();
    });
  });
}
