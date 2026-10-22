import { parentPort } from 'node:worker_threads';
import { v as HeapSnapshotWorkerDispatcher } from './HeapSnapshotLoader-B9los3Ne.js';

const dispatcher = new HeapSnapshotWorkerDispatcher(
  parentPort.postMessage.bind(parentPort)
);
parentPort.on("message", dispatcher.dispatchMessage.bind(dispatcher));
parentPort.postMessage("workerReady");
