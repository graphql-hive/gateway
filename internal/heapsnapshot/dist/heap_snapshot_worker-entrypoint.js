import { parentPort } from 'node:worker_threads';
import { P as HeapSnapshotWorkerDispatcher } from './HeapSnapshotLoader-00ODhOoc.js';

const dispatcher = new HeapSnapshotWorkerDispatcher(
  parentPort.postMessage.bind(parentPort)
);
parentPort.on("message", dispatcher.dispatchMessage.bind(dispatcher));
parentPort.postMessage("workerReady");
