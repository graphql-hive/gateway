import type { QueryPlan } from '@graphql-hive/router-query-planner';
import type {
  DelegationContext,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import {
  ExecutionRequest,
  ExecutionResult,
  isAsyncIterable,
  MaybeAsyncIterable,
} from '@graphql-tools/utils';
import {
  handleMaybePromise,
  mapAsyncIterator,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';

export const queryPlanForExecutionRequestContext = new WeakMap<
  any,
  QueryPlan
>();

export function getLazyPromise<T>(
  factory: () => MaybePromise<T>,
): () => MaybePromise<T> {
  let _value: MaybePromise<T>;
  return function () {
    if (_value == null) {
      _value = handleMaybePromise(factory, (value) => {
        _value = value;
        return value;
      });
    }
    return _value;
  };
}

export function getLazyValue<T>(factory: () => T): () => T {
  let _value: T;
  return function () {
    if (_value == null) {
      _value = factory();
    }
    return _value;
  };
}

export function getLazyFactory<T extends (...args: any) => any>(
  factory: () => T,
): T {
  let _value: T;
  return function (...args: Parameters<T>): ReturnType<T> {
    if (!_value) {
      _value = factory();
    }
    return _value(...args);
  } as T;
}

export function onSubgraphExecuteWithTransforms(
  subgraphName: string,
  executionRequest: ExecutionRequest,
  onSubgraphExecute: (
    subgraphName: string,
    executionRequest: ExecutionRequest,
  ) => MaybePromise<MaybeAsyncIterable<ExecutionResult>>,
  getSubschema: (subgraphName: string) => SubschemaConfig,
) {
  const subschema = getSubschema(subgraphName);
  if (subschema.transforms?.length) {
    const transforms = subschema.transforms;
    const transformationContext = Object.create(null);
    const delegationContext = undefined as unknown as DelegationContext;
    for (const transform of transforms) {
      if (transform.transformRequest) {
        executionRequest = transform.transformRequest(
          executionRequest,
          delegationContext,
          transformationContext,
        );
      }
    }
    return handleMaybePromiseMaybeAsyncIterable(
      () => onSubgraphExecute(subgraphName, executionRequest),
      (executionResult: ExecutionResult) => {
        for (const transform of transforms.toReversed()) {
          if (transform.transformResult) {
            executionResult = transform.transformResult(
              executionResult,
              delegationContext,
              transformationContext,
            );
          }
        }
        return executionResult;
      },
    );
  }
  return onSubgraphExecute(subgraphName, executionRequest);
}

export function handleMaybePromiseMaybeAsyncIterable<
  T,
  T$ extends MaybePromise<MaybeAsyncIterable<T>> = MaybePromise<
    MaybeAsyncIterable<T>
  >,
  TOutput = T,
>(
  executor: () => T$,
  mapper: (executionResult: T) => TOutput,
  errorMapper?: (error: Error) => TOutput,
): MaybePromise<MaybeAsyncIterable<TOutput>> {
  return handleMaybePromise(
    executor,
    (result$) => {
      if (isAsyncIterable<T>(result$)) {
        return mapAsyncIterator(result$, mapper, errorMapper);
      }
      return mapper(result$ as T);
    },
    errorMapper,
  ) as MaybePromise<MaybeAsyncIterable<TOutput>>;
}
