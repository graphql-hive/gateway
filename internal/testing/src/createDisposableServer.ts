import type { Server } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import type {
  ServerAdapter,
  ServerAdapterBaseObject,
} from '@whatwg-node/server';

export interface DisposableServerOpts {
  port?: number;
}

export interface DisposableServer {
  address(): AddressInfo;
  [DisposableSymbols.asyncDispose](): Promise<void>;
  server: Server;
}

export async function createDisposableServer<
  TServerContext,
  TBaseObject extends ServerAdapterBaseObject<TServerContext>,
>(
  adapter: ServerAdapter<TServerContext, TBaseObject>,
  opts?: DisposableServerOpts,
): Promise<DisposableServer> {
  const server = createServer(
    // @ts-expect-error TODO: type 'IncomingMessage' is not assignable to type 'NodeRequest' when using exactOptionalPropertyTypes
    adapter,
  );
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
    address() {
      return server.address() as AddressInfo;
    },
    [DisposableSymbols.asyncDispose]() {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.closeAllConnections();
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    get server(): Server {
      return server;
    },
  };
}
