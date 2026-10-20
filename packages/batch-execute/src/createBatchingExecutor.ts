import {
  ExecutionRequest,
  ExecutionResult,
  Executor,
  getOperationASTFromRequest,
  isAsyncIterable,
  MaybeAsyncIterable,
} from '@graphql-tools/utils';
import { fakePromise } from '@whatwg-node/promise-helpers';
import DataLoader from 'dataloader';
import { mergeRequests } from './mergeRequests.js';
import { splitResult } from './splitResult.js';

export function createBatchingExecutor(
  executor: Executor,
  dataLoaderOptions?: DataLoader.Options<
    ExecutionRequest,
    MaybeAsyncIterable<any>
  >,
  extensionsReducer: (
    mergedExtensions: Record<string, any>,
    request: ExecutionRequest,
  ) => Record<string, any> = defaultExtensionsReducer,
  defer = false,
): Executor {
  const loadFn = createLoadFn(executor, extensionsReducer, defer);
  const queryLoader = new DataLoader(loadFn, dataLoaderOptions);
  const mutationLoader = new DataLoader(loadFn, dataLoaderOptions);
  return function batchingExecutor(request: ExecutionRequest) {
    const operationType =
      request.operationType ?? getOperationASTFromRequest(request)?.operation;
    switch (operationType) {
      case 'query':
        return queryLoader.load(request);
      case 'mutation':
        return mutationLoader.load(request);
      case 'subscription':
        return executor(request);
      default:
        throw new Error(`Invalid operation type "${operationType}"`);
    }
  };
}

function createLoadFn(
  executor: Executor,
  extensionsReducer: (
    mergedExtensions: Record<string, any>,
    request: ExecutionRequest,
  ) => Record<string, any>,
  defer: boolean,
) {
  return function batchExecuteLoadFn(
    requests: ReadonlyArray<ExecutionRequest>,
  ): PromiseLike<Array<MaybeAsyncIterable<ExecutionResult>>> {
    // Single requests must keep AsyncIterable incremental streams intact so
    // IncrementalReceiver can flush the initial payload before deferred patches.
    if (requests.length === 1 && requests[0]) {
      const request = requests[0];
      return fakePromise()
        .then(() => executor(request))
        .catch((err) => err)
        .then((res) => [res]);
    }
    const mergedRequests = mergeRequests(requests, extensionsReducer, defer);
    return fakePromise()
      .then(() => executor(mergedRequests))
      .then((resultBatches) =>
        // Batched @defer merges patches into one result per original request
        collectExecutionResult(resultBatches),
      )
      .then((result) =>
        splitResult(result as ExecutionResult, requests.length),
      )
      .catch((err) => requests.map(() => err));
  };
}

/**
 * Flatten an incremental-delivery AsyncIterable into a single ExecutionResult
 * by merging top-level `data` and `incremental[].data` payloads (used when
 * batched sub-requests are wrapped in `@defer`).
 */
async function collectExecutionResult(
  result: MaybeAsyncIterable<ExecutionResult> | ExecutionResult,
): Promise<ExecutionResult> {
  if (!isAsyncIterable(result)) {
    return result as ExecutionResult;
  }
  const merged: ExecutionResult = { data: Object.create(null) };
  for await (const chunk of result) {
    if (chunk.data) {
      Object.assign(merged.data as Record<string, any>, chunk.data);
    }
    if (chunk.errors?.length) {
      merged.errors = [...(merged.errors ?? []), ...chunk.errors];
    }
    if (chunk.incremental) {
      for (const patch of chunk.incremental) {
        if (patch.errors?.length) {
          merged.errors = [...(merged.errors ?? []), ...patch.errors];
        }
        if (patch.data == null) {
          continue;
        }
        if (!patch.path?.length) {
          Object.assign(merged.data as Record<string, any>, patch.data);
        } else {
          setAtPath(merged.data as Record<string, any>, patch.path, patch.data);
        }
      }
    }
  }
  return merged;
}

function setAtPath(
  root: Record<string, any>,
  path: ReadonlyArray<string | number>,
  value: Record<string, any>,
): void {
  let current: any = root;
  for (let i = 0; i < path.length; i++) {
    const key = path[i]!;
    if (i === path.length - 1) {
      if (current[key] != null && typeof current[key] === 'object') {
        Object.assign(current[key], value);
      } else {
        current[key] = value;
      }
      return;
    }
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    current = current[key];
  }
}

function defaultExtensionsReducer(
  mergedExtensions: Record<string, any>,
  request: ExecutionRequest,
): Record<string, any> {
  const newExtensions = request.extensions;
  if (newExtensions != null) {
    Object.assign(mergedExtensions, newExtensions);
  }
  return mergedExtensions;
}
