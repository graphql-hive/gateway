import { H as HeapSnapshotLoader, a as HeapSnapshotProgress } from './HeapSnapshotLoader-B4FoPnCZ.js';
export { m as HeapSnapshot, b as HeapSnapshotEdge, d as HeapSnapshotEdgeIndexProvider, f as HeapSnapshotEdgeIterator, o as HeapSnapshotEdgesProvider, l as HeapSnapshotFilteredIterator, k as HeapSnapshotIndexRangeIterator, n as HeapSnapshotItemProvider, i as HeapSnapshotNode, c as HeapSnapshotNodeIndexProvider, j as HeapSnapshotNodeIterator, p as HeapSnapshotNodesProvider, g as HeapSnapshotRetainerEdge, e as HeapSnapshotRetainerEdgeIndexProvider, h as HeapSnapshotRetainerEdgeIterator, J as JSHeapSnapshot, r as JSHeapSnapshotEdge, q as JSHeapSnapshotNode, t as JSHeapSnapshotRetainerEdge, S as SecondaryInitManager, s as serializeUIString } from './HeapSnapshotLoader-B4FoPnCZ.js';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { Worker } from 'node:worker_threads';

var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};
const __dirname = fileURLToPath(new URL(".", import.meta.url));
async function parseHeapSnapshot(data, opts = {}) {
  var _stack = [];
  try {
    const { silent = true } = opts;
    const loader = new HeapSnapshotLoader(
      silent ? silentProgress : consoleProgress
    );
    await new Promise((resolve, reject) => {
      function consume(chunk) {
        loader.write(String(chunk));
      }
      data.on("data", consume);
      function cleanup() {
        data.off("data", consume);
        data.off("error", reject);
        data.off("end", resolve);
      }
      data.once("error", (e) => {
        cleanup();
        reject(e);
      });
      data.once("end", () => {
        cleanup();
        resolve();
      });
    });
    loader.close();
    await loader.parsingComplete;
    const secondWorker = new Worker(
      path.join(__dirname, "heap_snapshot_worker-entrypoint.js")
      // exists after building
    );
    const _ = __using(_stack, {
      async [Symbol.asyncDispose]() {
        await secondWorker.terminate();
      }
    }, true);
    const chan = new MessageChannel();
    secondWorker.postMessage(
      {
        data: {
          disposition: "setupForSecondaryInit",
          objectId: 0
        },
        ports: [chan.port2]
      },
      [chan.port2]
    );
    return await loader.buildSnapshot(chan.port1);
  } catch (_2) {
    var _error = _2, _hasError = true;
  } finally {
    var _promise = __callDispose(_stack, _error, _hasError);
    _promise && await _promise;
  }
}
const consoleProgress = new class ConsoleProgress extends HeapSnapshotProgress {
  reportProblem(error) {
    console.error(error);
  }
  updateProgress(title, value, total) {
    console.log(title, value, total);
  }
  updateStatus(status) {
    console.log(status);
  }
}();
const silentProgress = new class SilentProgress extends HeapSnapshotProgress {
  reportProblem() {
  }
  updateProgress() {
  }
  updateStatus() {
  }
}();

export { HeapSnapshotProgress, parseHeapSnapshot };
