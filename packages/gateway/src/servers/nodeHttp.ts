import { promises as fsPromises } from 'node:fs';
import { createServer as createHTTPServer, type Server } from 'node:http';
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
    keepAliveTimeout,
    gracefulShutdownTimeout = 0,
    websocketDrainTimeout = 0,
  } = opts;
  let server: Server;
  let protocol: string;
  let stopWebSocketServer: (() => Promise<void>) | undefined;

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

    const wsDisposable = useServer(
      getGraphQLWSOptions<TContext, Extra>(gwRuntime, (ctx) => ({
        req: ctx.extra.request,
        socket: ctx.extra.socket,
        request: normalizeNodeRequest(ctx.extra.request, gwRuntime.fetchAPI),
      })),
      wsServer,
    );

    const drainWebSocketClients = async () => {
      const clients = [...wsServer.clients];
      if (websocketDrainTimeout <= 0 || !clients.length) {
        return;
      }
      const batches = Math.min(
        clients.length,
        Math.max(1, Math.round(websocketDrainTimeout / 1000)),
      );
      const size = Math.ceil(clients.length / batches);
      const interval = Math.floor(websocketDrainTimeout / batches);
      log.info(
        { clients: clients.length, batches, interval },
        'Draining WebSocket clients',
      );
      for (let i = 0; i < clients.length; i += size) {
        for (const client of clients.slice(i, i + size)) {
          client.close(1001, 'Going away');
        }
        if (i + size < clients.length) {
          await new Promise((resolve) => setTimeout(resolve, interval));
        }
      }
      log.info('Drained WebSocket clients');
    };

    stopWebSocketServer = async () => {
      log.info('Stopping the WebSocket server');
      await drainWebSocketClients();
      const closeHandshakeTimeout = Math.max(gracefulShutdownTimeout, 1000);
      const fuse = setTimeout(() => {
        for (const client of wsServer.clients) {
          client.terminate();
        }
      }, closeHandshakeTimeout);
      fuse.unref();
      try {
        await wsDisposable.dispose();
        clearTimeout(fuse);
        log.info('Stopped the WebSocket server successfully');
      } catch (err) {
        log.warn({ err }, 'Failed to stop the WebSocket server');
      }
    };
    gwRuntime.disposableStack.defer(() => stopWebSocketServer?.());
  }
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      log.info(`Listening on ${url}`);
      gwRuntime.disposableStack.defer(async () => {
        process.stderr.write('\n');
        log.info('Stopping the server');
        const fuse =
          gracefulShutdownTimeout > 0
            ? setTimeout(() => {
                log.warn(
                  `Graceful shutdown timed out after ${gracefulShutdownTimeout}ms, force-closing remaining connections`,
                );
                server.closeAllConnections();
              }, gracefulShutdownTimeout)
            : (server.closeAllConnections(), undefined);
        if (fuse) {
          // allow the process to exit even if the fuse is still running
          fuse.unref();
        }
        server.closeIdleConnections();
        const closed = new Promise<void>((resolve) =>
          server.close(() => resolve()),
        );
        if (stopWebSocketServer) {
          await stopWebSocketServer();
          stopWebSocketServer = undefined;
        }
        await closed;
        clearTimeout(fuse);
        log.info('Stopped the server successfully');
      });
      return resolve();
    });
  });
}
