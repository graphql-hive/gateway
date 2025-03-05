import fs from 'fs/promises';
import { HeapProfiler } from 'inspector';
import { setTimeout } from 'timers/promises';
import { Proc } from '@internal/proc';
import { createDeferredPromise } from '@whatwg-node/promise-helpers';
import { WebSocket } from 'ws';

export type InspectorHeapSamplingProfile = HeapProfiler.SamplingHeapProfile;

export interface Inspector {
  collectGarbage(): Promise<void>;
  /**
   * Takes and writes the heap snapshot to the provided {@link path}.
   *
   * BEWARE: Taking heap snapshots is a blocking operation and often introduces a leak to the process (memory
   *         is much more stable when no snapshots are taken, can cause false positives). Where possible, consider
   *         using {@link startHeapSampling heap sampling} instead.
   */
  writeHeapSnapshot(path: string): Promise<void>;
  /** @returns Function that stops the heap sampling and returns the {@link InspectorHeapSamplingProfile sampling profile}. */
  startHeapSampling(): Promise<() => Promise<InspectorHeapSamplingProfile>>;
  [Symbol.dispose](): void;
}

/**
 * Activates the inspector protocol on the provided Node process, waits for
 * it to become available and connects.
 */
export async function connectInspector(proc: Proc): Promise<Inspector> {
  proc.kill('SIGUSR1'); // activate inspector protocol

  // wait for the debugger to start
  let debuggerUrl = '';
  while (!debuggerUrl) {
    await setTimeout(100);
    for (const line of proc.getStd('err').split('\n')) {
      debuggerUrl = line.split('Debugger listening on ')?.[1] || '';
      if (debuggerUrl) {
        break;
      }
    }
  }

  const ws = new WebSocket(debuggerUrl, {
    maxPayload: 10000000000, // messages can be huge, increase max buffer size like here https://nodejs.org/en/learn/diagnostics/memory/using-heap-snapshot#4-trigger-heap-snapshot-using-inspector-protocol
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('close', reject);
  });

  const { promise: throwOnClosed, reject: closed } = createDeferredPromise();
  ws.once('close', closed);

  let closedError: unknown = null;
  function throwIfClosed() {
    if (closedError) {
      throw closedError;
    }
  }
  throwOnClosed.catch((err) => {
    closedError = err;
  });

  // enable heap profiler on connect
  // TODO: do we always need it? does it influence the performance?
  await call(ws, 'HeapProfiler.enable');

  return {
    async collectGarbage() {
      throwIfClosed();
      await call(ws, 'HeapProfiler.collectGarbage');
    },
    async writeHeapSnapshot(path: string) {
      throwIfClosed();

      // replace existing snapshot
      await fs.rm(path, { force: true });

      const fd = await fs.open(path, 'w');
      await using _0 = {
        async [Symbol.asyncDispose]() {
          await fd.close();
        },
      };

      const id = genId();

      const writes: Promise<unknown>[] = [];
      const { promise: waitForHeapSnapshotDone, resolve: heapSnapshotDone } =
        createDeferredPromise();
      function onMessage(m: WebSocket.Data) {
        const data = JSON.parse(m.toString());
        if (data.params?.chunk) {
          // write chunks to file asyncronously
          writes.push(fd.write(data.params.chunk));
        }
        if (data.id === id) {
          // receiving a message with the id of the takeHeapSnapshot means the snapshotting is done
          heapSnapshotDone();
        }
      }
      ws.on('message', onMessage);
      using _1 = {
        [Symbol.dispose]() {
          ws.off('message', onMessage);
        },
      };

      // make sure socket is still open
      throwIfClosed();

      // initiate heap snapshot taking
      ws.send(`{"id":${id},"method":"HeapProfiler.takeHeapSnapshot"}`);

      await Promise.race([throwOnClosed, waitForHeapSnapshotDone]);

      // wait for all writes to complete
      await Promise.all(writes);
    },
    async startHeapSampling() {
      throwIfClosed();
      await call(ws, 'HeapProfiler.startSampling');
      return async function stopSampling() {
        throwIfClosed();
        const msg = await call(ws, 'HeapProfiler.stopSampling');
        const data = JSON.parse(msg.toString());
        if (!data.result?.profile) {
          throw new Error(
            'No heap sampling profile found after stopping\n' + msg.toString(),
          );
        }
        return data.result.profile;
      };
    },
    [Symbol.dispose]() {
      // TODO: should we throw if closed here? we already dont care at this point
      ws.close();
    },
  };
}

function genId() {
  return Math.floor(Math.random() * 1000);
}

/** Calls/invokes a method on the inspector protocol and waits for confirmation. */
function call(
  ws: WebSocket,
  method:
    | 'HeapProfiler.enable'
    | 'HeapProfiler.disable'
    | 'HeapProfiler.collectGarbage'
    | 'HeapProfiler.startSampling'
    | 'HeapProfiler.stopSampling'
    | 'HeapProfiler.startTrackingHeapObjects'
    | 'HeapProfiler.stopTrackingHeapObjects',
): Promise<WebSocket.Data> {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket is not open');
  }
  const id = genId();
  ws.send(`{"id":${id},"method":"${method}"}`);
  return waitForMessage(ws, (m) => m.toString().includes(`"id":${id}`));
}

function waitForMessage(
  ws: WebSocket,
  check: (m: WebSocket.Data) => boolean,
): Promise<WebSocket.Data> {
  const { promise, resolve, reject } = createDeferredPromise<WebSocket.Data>();
  ws.once('close', reject);
  function onMessage(m: WebSocket.Data) {
    if (check(m)) {
      resolve(m);
    }
  }
  ws.once('message', onMessage);
  return Promise.race([
    promise,
    setTimeout(1_000).then(() => {
      throw new Error('Timeout waiting for message');
    }),
  ]).finally(() => {
    ws.off('close', reject);
    ws.off('message', onMessage);
  });
}
