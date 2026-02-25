import { createDisposableServer } from '@internal/testing';
import { createServerAdapter, DisposableSymbols } from '@whatwg-node/server';

export type QueuedHandler = (req: Request) => Response | Promise<Response>;

export interface QueueServer {
  url: string;
  queue(handler: QueuedHandler): Promise<Response>;
}

export async function createQueueServer(): Promise<QueueServer> {
  const queuedHandlers: QueuedHandler[] = [];

  const serv = await createDisposableServer(
    createServerAdapter(async (req) => {
      const handler = queuedHandlers.pop();
      if (!handler) {
        throw new Error('TODO: wait for handler to be queueud');
      }
      return handler(req);
    }),
  );

  // stop the iterator when the server gets disposed
  const origDispose = serv[DisposableSymbols.asyncDispose];
  serv[DisposableSymbols.asyncDispose] = async () => {
    stop();
    await origDispose.call(serv);
  };

  return {
    url: serv.url,
    queue(handler: QueuedHandler) {
      // TODO: the handler to the queue, wait for it to be called, and return the response
    },
  };
}
