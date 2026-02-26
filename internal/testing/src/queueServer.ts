import { createDisposableServer, DisposableServer } from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
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
  /**
   * A convenience method to perform a fetch against the server, using the queued handlers
   * to process requests.
   */
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
  /**
   * Clears all pending handlers in the queue, rejecting their promises with an error.
   */
  clear(): void;
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
  const queuedEntries: QueueEntry[] = [];
  let entryAvailable = createDeferredPromise<void>();

  const adapter = createServerAdapter(async (req) => {
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
  });
  const serv = await createDisposableServer(adapter);

  function clear(errMsg: string) {
    for (const entry of queuedEntries.splice(0)) {
      entry.responseDeferred.reject(new Error(errMsg));
    }
  }

  const origDispose = serv[DisposableSymbols.asyncDispose].bind(serv);
  return Object.assign(serv, {
    [DisposableSymbols.asyncDispose]() {
      clear('Queue server disposed');
      return origDispose();
    },
    clear() {
      clear('Queue cleared');
    },
    queue(handler: QueuedHandler) {
      const responseDeferred = createDeferredPromise<Response>();
      queuedEntries.push({ handler, responseDeferred });
      entryAvailable.resolve();
      return responseDeferred.promise;
    },
    async fetch(input: RequestInfo, init?: RequestInit) {
      return adapter.fetch(
        // yeah I know fetch accepts input and init args, but types dont align
        new Request(input, init),
      );
    },
  });
}
