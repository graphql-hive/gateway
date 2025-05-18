import {
  ExecutionRequest,
  ExecutionResult,
  Executor,
  getOperationASTFromRequest,
} from '@graphql-tools/utils';
import { fakePromise } from '@whatwg-node/promise-helpers';
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
      return fakePromise()
        .then(() => executor(request))
        .catch((err) => err)
        .then((res) => [res]);
    }
    const mergedRequests = mergeRequests(requests, extensionsReducer);
    return fakePromise()
      .then(() => executor(mergedRequests))
      .then((resultBatches) =>
        splitResult(resultBatches as ExecutionResult, requests.length),
      )
      .catch((err) => requests.map(() => err));
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
