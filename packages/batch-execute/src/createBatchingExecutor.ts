import {
  ExecutionRequest,
  ExecutionResult,
  Executor,
  getOperationASTFromRequest,
  isAsyncIterable,
} from '@graphql-tools/utils';
import { fakePromise, handleMaybePromise } from '@whatwg-node/promise-helpers';
import DataLoader from 'dataloader';
import { mergeRequests } from './mergeRequests.js';
import { splitResult } from './splitResult.js';

export function createBatchingExecutor(
  executor: Executor,
  dataLoaderOptions?: DataLoader.Options<any, any, any>,
  extensionsReducer: (
    mergedExtensions: Record<string, any>,
    request: ExecutionRequest,
  ) => Record<string, any> = defaultExtensionsReducer,
): Executor {
  const loadFn = createLoadFn(executor, extensionsReducer);
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
) {
  return function batchExecuteLoadFn(
    requests: ReadonlyArray<ExecutionRequest>,
  ): PromiseLike<Array<ExecutionResult>> {
    if (requests.length === 1 && requests[0]) {
      const request = requests[0];
      return fakePromise<any>(
        handleMaybePromise(
          () => executor(request),
          (result) => [result],
          (err) => [err],
        ),
      );
    }
    const mergedRequests = mergeRequests(requests, extensionsReducer);
    return fakePromise<any>(
      handleMaybePromise(
        () => executor(mergedRequests),
        (resultBatches) => {
          if (isAsyncIterable(resultBatches)) {
            throw new Error(
              'Executor must not return incremental results for batching',
            );
          }
          return splitResult(resultBatches, requests.length);
        },
      ),
    );
  };
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
