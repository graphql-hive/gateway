import { isPromise } from 'node:util/types';
import type { QueryPlan } from '@graphql-hive/router-query-planner';
import { resolveRepresentation } from '@graphql-mesh/fusion-runtime';
import type {
  DelegationContext,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import {
  asArray,
  ExecutionRequest,
  ExecutionResult,
  isAsyncIterable,
  MaybeAsyncIterable,
  memoize1,
} from '@graphql-tools/utils';
import {
  handleMaybePromise,
  mapAsyncIterator,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';
import {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  valueFromASTUntyped,
  visit,
} from 'graphql';
import { GraphQLError } from 'graphql/error';

export const queryPlanForExecutionRequestContext = new WeakMap<
  any,
  QueryPlan
>();

const getEntityResolutionNodes = memoize1(function isEntityResolutionRequest(
  document: DocumentNode,
): FieldNode[] {
  const entityResolutionNodes: FieldNode[] = [];
  visit(document, {
    Field(node) {
      if (node.name.value === '_entities') {
        entityResolutionNodes.push(node);
      }
      return node;
    },
  });
  return entityResolutionNodes;
});

const hasCustomMerging = memoize1(function hasCustomMerging(
  subschema: SubschemaConfig,
): boolean {
  return (
    subschema.merge != null &&
    Object.values(subschema.merge).some(
      (mergeConfig) =>
        mergeConfig.fieldName !== '_entities' &&
        mergeConfig.entryPoints?.some(
          (entryPoint) => entryPoint.fieldName !== '_entities',
        ),
    )
  );
});

const getFragments = memoize1(function getFragments(
  document: DocumentNode,
): FragmentDefinitionNode[] {
  return document.definitions.filter(
    (def) => def.kind === 'FragmentDefinition',
  ) as FragmentDefinitionNode[];
});

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
  const entityResolutionNodes = getEntityResolutionNodes(
    executionRequest.document,
  );
  if (hasCustomMerging(subschema) && entityResolutionNodes.length > 0) {
    const resolveFnByKey = new Map<string, (() => any)[]>();
    for (const node of entityResolutionNodes) {
      for (const arg of node.arguments ?? []) {
        if (arg.name.value === 'representations') {
          const representations = asArray(
            valueFromASTUntyped(arg.value, executionRequest.variables),
          );
          if (representations != null) {
            const responseKey = node.alias ? node.alias.value : node.name.value;
            let resolveFns = resolveFnByKey.get(responseKey);
            if (resolveFns == null) {
              resolveFns = [];
              resolveFnByKey.set(responseKey, resolveFns);
            }
            for (const representation of representations) {
              const fragments = getFragments(executionRequest.document);
              resolveFns.push(() =>
                resolveRepresentation(
                  subschema,
                  representation,
                  executionRequest.context,
                  executionRequest.info,
                  [node],
                  node.selectionSet,
                  fragments,
                ),
              );
            }
          }
        }
      }
    }
    const data: Record<string, any> = {};
    const errors: GraphQLError[] = [];
    const jobs: Promise<void>[] = [];
    for (const [key, resolveFns] of resolveFnByKey) {
      const finalResult: any[] = (data[key] = []);
      for (
        let representationIndex = 0;
        representationIndex < resolveFns.length;
        representationIndex++
      ) {
        const resolveFn = resolveFns[representationIndex];
        if (resolveFn != null) {
          const job$ = handleMaybePromise(
            resolveFn,
            (result) => {
              finalResult[representationIndex] = result;
            },
            (error) => {
              errors.push(error);
            },
          );
          if (isPromise(job$)) {
            jobs.push(job$);
          }
        }
      }
    }
    function handleExecutionResult() {
      return {
        data,
        errors: errors.length > 0 ? errors : undefined,
      };
    }
    if (jobs.length > 0) {
      return handleMaybePromise(() => Promise.all(jobs), handleExecutionResult);
    }
    return handleExecutionResult();
  }
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
  mapper: (executionResult: T) => MaybePromise<MaybeAsyncIterable<TOutput>>,
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
