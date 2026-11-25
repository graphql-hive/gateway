import { parentPort } from 'node:worker_threads';
import { v as HeapSnapshotWorkerDispatcher } from './HeapSnapshotLoader-CcfbHPSu.js';

const dispatcher = new HeapSnapshotWorkerDispatcher(
  parentPort.postMessage.bind(parentPort)
);
parentPort.on("message", dispatcher.dispatchMessage.bind(dispatcher));
parentPort.postMessage("workerReady");
