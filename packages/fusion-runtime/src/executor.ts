import { createDefaultExecutor } from '@graphql-mesh/transport-common';
import {
  Executor,
  isAsyncIterable,
  type DisposableExecutor,
  type ExecutionRequest,
  type ExecutionResult,
} from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import {
  handleMaybePromise,
  mapAsyncIterator,
} from '@whatwg-node/promise-helpers';
import { print, type DocumentNode } from 'graphql';
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
            () => print(execReq.document),
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
                    () => print(execReq.document),
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
  Object.defineProperty(unifiedGraphExecutor, DisposableSymbols.asyncDispose, {
    configurable: true,
    enumerable: true,
    get() {
      return function unifiedGraphExecutorDispose() {
        opts?.transportContext?.log.debug('Disposing unified graph executor');
        return unifiedGraphManager[DisposableSymbols.asyncDispose]();
      };
    },
  });
  return unifiedGraphExecutor as DisposableExecutor<TContext>;
}

export function getSdkRequesterForUnifiedGraph(
  opts: UnifiedGraphManagerOptions<any>,
): SdkRequester {
  const unifiedGraphExecutor = getExecutorForUnifiedGraph(opts);
  return function sdkRequester(
    document: DocumentNode,
    variables?: any,
    operationContext?: any,
  ) {
    return handleMaybePromise(
      () =>
        unifiedGraphExecutor({
          document,
          variables,
          context: operationContext,
        }),
      (result) => {
        if (isAsyncIterable(result)) {
          return mapAsyncIterator(result, extractDataOrThrowErrors);
        }
        return extractDataOrThrowErrors(result);
      },
    );
  };
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
