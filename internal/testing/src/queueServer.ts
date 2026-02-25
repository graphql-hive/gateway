import { createDisposableServer, DisposableServer } from '@internal/testing';
import {
  createDeferredPromise,
  DeferredPromise,
} from '@whatwg-node/promise-helpers';
import { createServerAdapter } from '@whatwg-node/server';

export type QueuedHandler = (req: Request) => Response | Promise<Response>;

/**
 * A test server that processes incoming requests one at a time using pre-queued handlers.
 * Dispose to stop the underlying HTTP server.
 */
export interface QueueServer extends DisposableServer {
  /** The URL of the server. */
  url: string;
  /**
   * Registers a handler for the next incoming request and waits for it to be called.
   * Resolves with the response once the handler completes, or rejects if the handler throws.
   */
  queue(handler: QueuedHandler): Promise<Response>;
}

interface QueueEntry {
  handler: QueuedHandler;
  responseDeferred: DeferredPromise<Response>;
}

/**
 * Creates a {@link QueueServer} that listens on a random port.
 * Requests are handled in the order they arrive, each by the next queued handler.
 * Use `await using` or manually dispose to shut down the server when done.
 */
export async function createDisposableQueueServer(): Promise<QueueServer> {
  // TODO: the queue should empty on dispose and reject all pending handlers
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

  return Object.assign(serv, {
    queue(handler: QueuedHandler) {
      const responseDeferred = createDeferredPromise<Response>();
      queuedEntries.push({ handler, responseDeferred });
      entryAvailable.resolve();
      return responseDeferred.promise;
    },
  });
}
