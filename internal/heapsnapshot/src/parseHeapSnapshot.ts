import { Worker } from 'node:worker_threads';
import { HeapSnapshotProgress, JSHeapSnapshot } from './HeapSnapshot.js';
import { HeapSnapshotLoader } from './HeapSnapshotLoader.js';

export interface ParseHeapSnapshotOptions {
  /**
   * Whether to suppress console output.
   *
   * @default true
   */
  silent?: boolean;
}

export async function parseHeapSnapshot(
  data: string,
  opts: ParseHeapSnapshotOptions = {},
): Promise<JSHeapSnapshot> {
  const loader = new HeapSnapshotLoader(
    opts.silent ? silentProgress : consoleProgress,
  );
  loader.write(data);
  loader.close();

  // TODO: this will hang if the snapshot is incomplete or in some cases malformed
  await loader.parsingComplete;

  // two workers are used to parse the heap snapshots, this will
  // be the main one and the second one initialised in "assistant" mode
  const secondWorker = new Worker(
    './heap_snapshot_worker-entrypoint.js', // exists after building
  );
  await using _ = {
    async [Symbol.asyncDispose]() {
      await secondWorker.terminate();
    },
  };
  const chan = new MessageChannel();
  secondWorker.postMessage(
    {
      data: {
        disposition: 'setupForSecondaryInit',
        objectId: 0,
      },
      ports: [chan.port2],
    },
    [chan.port2],
  );

  return await loader.buildSnapshot(chan.port1);
}

const consoleProgress =
  new (class ConsoleProgress extends HeapSnapshotProgress {
    override reportProblem(error: string): void {
      console.error(error);
    }
    override updateProgress(title: string, value: number, total: number): void {
      console.log(title, value, total);
    }
    override updateStatus(status: string): void {
      console.log(status);
    }
  })();
const silentProgress = new (class SilentProgress extends HeapSnapshotProgress {
  override reportProblem() {
    // noop
  }
  override updateProgress() {
    // noop
  }
  override updateStatus() {
    // noop
  }
})();
