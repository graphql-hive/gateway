import { createServer } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { ServerAdapter } from '@whatwg-node/server';

export interface DisposableServerOpts {
  port?: number;
}

export interface DisposableServer {
  url: string;
  [DisposableSymbols.asyncDispose](): Promise<void>;
}

export const createDisposableServer = globalThis.Bun
  ? createDisposableBunServer
  : createDisposableNodeServer;

function createDisposableBunServer(
  handler?: ServerAdapter<any, any>,
  opts?: DisposableServerOpts,
): DisposableServer {
  const server = Bun.serve({
    port: opts?.port || 0,
    fetch: handler,
  });
  return {
    get url(): string {
      return server.url.toString();
    },
    [DisposableSymbols.asyncDispose]() {
      return server.stop(true);
    },
  };
}

async function createDisposableNodeServer(
  handler?: ServerAdapter<any, any>,
  opts?: DisposableServerOpts,
): Promise<DisposableServer> {
  const server = createServer(handler);
  const port = opts?.port || 0;
  await new Promise<void>((resolve, reject) => {
    server.once('error', (err) => reject(err));
    server.listen(port, () => resolve());
  });
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
    });
  });
  return {
    get url(): string {
      const address = server.address() as AddressInfo;
      return `http://localhost:${address.port}`;
    },
    [DisposableSymbols.asyncDispose]() {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.closeAllConnections();
      return new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
