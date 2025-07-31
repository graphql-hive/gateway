import { parentPort } from 'node:worker_threads';
import { u as HeapSnapshotWorkerDispatcher } from './HeapSnapshotLoader-B4FoPnCZ.js';

const dispatcher = new HeapSnapshotWorkerDispatcher(
  parentPort.postMessage.bind(parentPort)
);
parentPort.on("message", dispatcher.dispatchMessage.bind(dispatcher));
parentPort.postMessage("workerReady");
