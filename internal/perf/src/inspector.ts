import fs from 'fs/promises';
import { setTimeout } from 'timers/promises';
import { createDeferred } from '@graphql-tools/delegate';
import { Proc } from '@internal/proc';
import { WebSocket } from 'ws';

export interface Inspector {
  writeHeapSnapshot(path: string): Promise<void>;
  [Symbol.dispose](): void;
}

export async function connectInspector(proc: Proc): Promise<Inspector> {
  proc.kill('SIGUSR1'); // activate inspector protocol

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

  const { promise: throwOnClosed, reject: closed } = createDeferred();
  ws.once('close', closed);

  ws.send('{"id":1,"method":"HeapProfiler.enable"}');

  return {
    async writeHeapSnapshot(path: string) {
      await fs.rm(path, { force: true }); // replace existing snapshot

      const fd = await fs.open(path, 'w');
      await using _ = {
        async [Symbol.asyncDispose]() {
          await fd.close();
        },
      };

      const id = Math.floor(Math.random() * 1000);

      const writes: Promise<unknown>[] = [];
      const { promise: waitForHeapSnapshotDone, resolve: heapSnapshotDone } =
        createDeferred<void>();
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
