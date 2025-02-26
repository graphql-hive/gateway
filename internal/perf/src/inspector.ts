import fs from 'fs/promises';
import { setTimeout } from 'timers/promises';
import { Proc } from '@internal/proc';
import { createDeferredPromise } from '@whatwg-node/promise-helpers';
import { WebSocket } from 'ws';

export interface Inspector {
  collectGarbage(): Promise<void>;
  writeHeapSnapshot(path: string): Promise<void>;
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

  // enables the heap profiler and disables it on dispose
  function heapProfiler() {
    ws.send(`{"id":${genId()},"method":"HeapProfiler.enable"}`);
    return {
      [Symbol.dispose]() {
        ws.send(`{"id":${genId()},"method":"HeapProfiler.disable"}`);
      },
    };
  }

  return {
    async collectGarbage() {
      using _ = heapProfiler();
      ws.send(`{"id":${genId()},"method":"HeapProfiler.collectGarbage"}`);
    },
    async writeHeapSnapshot(path: string) {
      using _0 = heapProfiler();

      // replace existing snapshot
      await fs.rm(path, { force: true });

      const fd = await fs.open(path, 'w');
      await using _1 = {
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
          ws.off('message', onMessage);
          return;
        }
      }
      ws.on('message', onMessage);

      // initiate heap snapshot taking
      ws.send(`{"id":${id},"method":"HeapProfiler.takeHeapSnapshot"}`);

      await Promise.race([throwOnClosed, waitForHeapSnapshotDone]);

      // wait for all writes to complete
      await Promise.all(writes);
    },
    [Symbol.dispose]() {
      ws.close();
    },
  };
}

function genId() {
  return Math.floor(Math.random() * 1000);
}
