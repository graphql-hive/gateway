import { createDisposableServer } from '@internal/testing';
import {
  createDeferredPromise,
  DeferredPromise,
} from '@whatwg-node/promise-helpers';
import { createServerAdapter } from '@whatwg-node/server';

export type QueuedHandler = (req: Request) => Response | Promise<Response>;

export interface QueueServer {
  url: string;
  queue(handler: QueuedHandler): Promise<Response>;
}

interface QueueEntry {
  handler: QueuedHandler;
  responseDeferred: DeferredPromise<Response>;
}

export async function createQueueServer(): Promise<QueueServer> {
  const queuedEntries: QueueEntry[] = [];
  let entryAvailable = createDeferredPromise<void>();

  const serv = await createDisposableServer(
    createServerAdapter(async (req) => {
      if (!queuedEntries.length) {
        await entryAvailable.promise; // wait for available entry
        entryAvailable = createDeferredPromise<void>(); // prepare next waiter
      }

      const entry = queuedEntries.shift()!;
      try {
        const response = await entry.handler(req);
        entry.responseDeferred.resolve(response);
        return response;
      } catch (err) {
        entry.responseDeferred.reject(err);
        throw err;
      }
    }),
  );

  return {
    url: serv.url,
    queue(handler: QueuedHandler) {
      const responseDeferred = createDeferredPromise<Response>();
      queuedEntries.push({ handler, responseDeferred });
      entryAvailable.resolve();
      return responseDeferred.promise;
    },
  };
}
