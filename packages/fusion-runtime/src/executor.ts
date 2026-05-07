import {
  createDefaultExecutor,
  defaultPrintFn,
} from '@graphql-mesh/transport-common';
import { makeAsyncDisposable } from '@graphql-mesh/utils';
import { getBatchingExecutor } from '@graphql-tools/batch-execute';
import {
  Executor,
  isAsyncIterable,
  MaybeAsyncIterable,
  type ExecutionRequest,
  type ExecutionResult,
} from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import {
  handleMaybePromise,
  mapAsyncIterator,
  MaybePromise,
} from '@whatwg-node/promise-helpers';
import { type DocumentNode } from 'graphql';
import {
  UnifiedGraphManager,
  type UnifiedGraphManagerOptions,
} from './unifiedGraphManager';

type SdkRequester = (
  document: DocumentNode,
  variables?: any,
  operationContext?: any,
) => any;

export function getExecutorForUnifiedGraph<TContext>(
  opts: UnifiedGraphManagerOptions<TContext>,
) {
  const unifiedGraphManager = new UnifiedGraphManager(opts);
  const unifiedGraphExecutor = function unifiedGraphExecutor(
    execReq: ExecutionRequest,
  ) {
    return handleMaybePromise(
      () => unifiedGraphManager.getContext(execReq.context),
      (context) => {
        function handleExecutor(executor: Executor) {
          opts?.transportContext?.log.debug(
            'Executing request on unified graph',
            () => defaultPrintFn(execReq.document),
          );
          return executor({
            ...execReq,
            context,
          });
        }
        return handleMaybePromise(
          () => unifiedGraphManager.getExecutor(),
          (executor) => {
            if (!executor) {
              return handleMaybePromise(
                () => unifiedGraphManager.getUnifiedGraph(),
                (unifiedGraph) => {
                  opts?.transportContext?.log.debug(
                    'Executing request on unified graph',
                    () => defaultPrintFn(execReq.document),
                  );
                  executor = createDefaultExecutor(unifiedGraph);
                  return handleExecutor(executor);
                },
              );
            }
            return handleExecutor(executor);
          },
        );
      },
    );
  };
  return makeAsyncDisposable(
    unifiedGraphExecutor,
    function unifiedGraphExecutorDispose() {
      opts?.transportContext?.log.debug('Disposing unified graph executor');
      return unifiedGraphManager[DisposableSymbols.asyncDispose]();
    },
  );
}

export interface SdkRequesterOptions extends UnifiedGraphManagerOptions<any> {
  dataLoaderOptions?: Parameters<typeof getBatchingExecutor>[2];
  extensionsReducer?: (
    mergedExtensions: Record<string, any>,
    request: ExecutionRequest,
  ) => Record<string, any>;
  onExecutionRequest?(
    request: ExecutionRequest,
  ): MaybePromise<ExecutionRequest>;
}

const identity = <T>(x: T) => x;

export function getSdkRequesterForUnifiedGraph(
  opts: SdkRequesterOptions,
): SdkRequester {
  const unifiedGraphExecutor = getExecutorForUnifiedGraph(opts);
  const onExecutionRequest = opts.onExecutionRequest || identity;
  return function sdkRequester(
    document: DocumentNode,
    variables?: any,
    operationContext?: any,
  ) {
    let executionRequest: ExecutionRequest = {
      document,
      variables,
      context: operationContext,
    };
    return handleMaybePromise(
      () => onExecutionRequest(executionRequest),
      (onExecutionRequestResult) => {
        if (onExecutionRequestResult != null) {
          executionRequest = onExecutionRequestResult;
        }
        const executor: Executor =
          executionRequest.context != null
            ? getBatchingExecutor(
                executionRequest.context,
                unifiedGraphExecutor,
                opts?.dataLoaderOptions,
                opts?.extensionsReducer,
              )
            : unifiedGraphExecutor;
        return handleMaybePromise(
          () => executor(executionRequest),
          handleMaybePromiseMaybeAsyncIterableResult,
        );
      },
    );
  };
}

export function handleMaybePromiseMaybeAsyncIterableResult<T>(
  result: MaybePromise<MaybeAsyncIterable<ExecutionResult<T>>>,
): MaybePromise<MaybeAsyncIterable<T | null>> {
  return handleMaybePromise(
    () => result,
    (resolvedResult) => {
      if (isAsyncIterable(resolvedResult)) {
        return mapAsyncIterator(resolvedResult, extractDataOrThrowErrors);
      }
      return extractDataOrThrowErrors(resolvedResult);
    },
  );
}

function extractDataOrThrowErrors<T>(result: ExecutionResult<T>): T | null {
  if (result.errors) {
    if (result.errors.length === 1) {
      throw result.errors[0];
    }
    throw new AggregateError(result.errors);
  }
  if (!result.data) {
    return null;
  }
  return result.data;
}
