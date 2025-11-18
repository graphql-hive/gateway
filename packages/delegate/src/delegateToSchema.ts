import { getBatchingExecutor } from '@graphql-tools/batch-execute';
import { executorFromSchema } from '@graphql-tools/executor';
import {
  ExecutionResult,
  Executor,
  getDefinedRootType,
  getOperationASTFromRequest,
  isAsyncIterable,
  Maybe,
  MaybeAsyncIterable,
  memoize1,
  mergeDeep,
} from '@graphql-tools/utils';
import { Repeater } from '@repeaterjs/repeater';
import {
  handleMaybePromise,
  mapAsyncIterator,
} from '@whatwg-node/promise-helpers';
import {
  DocumentNode,
  FieldDefinitionNode,
  FragmentDefinitionNode,
  GraphQLOutputType,
  GraphQLResolveInfo,
  GraphQLSchema,
  isListType,
  isSchema,
  OperationTypeNode,
  validate,
} from 'graphql';
import { applySchemaTransforms } from './applySchemaTransforms.js';
import { createRequest, getDelegatingOperation } from './createRequest.js';
import { isSubschema } from './Subschema.js';
import { isSubschemaConfig } from './subschemaConfig.js';
import { Transformer } from './Transformer.js';
import {
  DelegationContext,
  IDelegateRequestOptions,
  IDelegateToSchemaOptions,
  StitchingInfo,
  SubschemaConfig,
} from './types.js';

const getFragmentDefinitions = memoize1(
  (info: GraphQLResolveInfo): FragmentDefinitionNode[] => {
    const fragmentMap = info.fragments;
    return Object.values(fragmentMap);
  },
);

export function delegateToSchema<
  TContext extends Record<string, any> = Record<string, any>,
  TArgs extends Record<string, any> = any,
>(options: IDelegateToSchemaOptions<TContext, TArgs>): any {
  let {
    info,
    schema,
    rootValue = (schema as SubschemaConfig).rootValue ?? info.rootValue,
    operationName = info.operation.name?.value,
    operation = getDelegatingOperation(info.parentType, info.schema),
    fieldName = info.fieldName,
    selectionSet,
    fieldNodes = info.fieldNodes,
    context,
    args,
    transformedSchema,
  } = options;

  if (isSubschema(schema)) {
    transformedSchema = schema.transformedSchema;
  } else if (isSchema(schema)) {
    transformedSchema = schema;
  } else {
    const stitchingInfo = info.schema.extensions?.['stitchingInfo'] as Maybe<
      StitchingInfo<TContext>
    >;
    const subschema = stitchingInfo?.subschemaMap.get(schema);
    if (subschema != null) {
      transformedSchema = subschema.transformedSchema;
    } else {
      transformedSchema = applySchemaTransforms(schema.schema, schema);
    }
  }

  const fragments = info ? getFragmentDefinitions(info) : undefined;

  const request = createRequest({
    subgraphName: (schema as SubschemaConfig).name,
    fragments,
    transformedSchema,
    targetRootValue: rootValue,
    targetOperationName: operationName,
    targetOperation: operation,
    targetFieldName: fieldName,
    selectionSet,
    fieldNodes,
    context,
    info,
    args,
  });
  return delegateRequest({
    ...options,
    transformedSchema,
    request,
  });
}

function getDelegationReturnType(
  targetSchema: GraphQLSchema,
  operation: OperationTypeNode,
  fieldName: string,
): GraphQLOutputType {
  const rootType = getDefinedRootType(targetSchema, operation);
  const rootFieldType = rootType.getFields()[fieldName];
  if (!rootFieldType) {
    throw new Error(
      `Unable to find field '${fieldName}' in type '${rootType}'.`,
    );
  }
  return rootFieldType.type;
}

export function delegateRequest<
  TContext extends Record<string, any> = Record<string, any>,
  TArgs extends Record<string, any> = any,
>(options: IDelegateRequestOptions<TContext, TArgs>) {
  const delegationContext = getDelegationContext(options);

  const transformer = new Transformer<TContext>(delegationContext);

  const processedRequest = transformer.transformRequest(options.request);

  if (options.validateRequest) {
    validateRequest(delegationContext, processedRequest.document);
  }

  return handleMaybePromise(
    () => getExecutor(delegationContext)(processedRequest),
    function handleExecutorResult(
      executorResult: MaybeAsyncIterable<ExecutionResult<any>>,
    ) {
      if (isAsyncIterable(executorResult)) {
        // This might be a stream
        if (
          delegationContext.operation === 'query' &&
          isListType(delegationContext.returnType)
        ) {
          return new Repeater<ExecutionResult<any>>(async (push, stop) => {
            const pushed = new WeakSet();
            let stopped = false;
            stop.finally(() => {
              stopped = true;
            });
            try {
              for await (const result of executorResult) {
                if (stopped) {
                  break;
                }
                if (result.incremental) {
                  const data = {};
                  for (const incrementalRes of result.incremental) {
                    if (incrementalRes.items?.length) {
                      for (const item of incrementalRes.items) {
                        setObjectKeyPath(
                          data,
                          (incrementalRes.path || []).slice(0, -1),
                          item,
                        );
                      }
                      await push(await transformer.transformResult({ data }));
                    }
                  }
                  if (result.hasNext === false) {
                    break;
                  } else {
                    continue;
                  }
                }
                const transformedResult =
                  await transformer.transformResult(result);
                // @stream needs to get the results one by one
                if (Array.isArray(transformedResult)) {
                  for (const individualResult$ of transformedResult) {
                    if (stopped) {
                      break;
                    }
                    const individualResult = await individualResult$;
                    // Avoid pushing the same result multiple times
                    if (!pushed.has(individualResult)) {
                      pushed.add(individualResult);
                      await push(individualResult);
                    }
                  }
                } else {
                  await push(await transformedResult);
                }
              }
              stop();
            } catch (error) {
              stop(error);
            }
          });
        }
        return mapAsyncIterator(executorResult, (result) =>
          transformer.transformResult(result),
        );
      }
      return transformer.transformResult(executorResult);
    },
  );
}

function getDelegationContext<TContext extends Record<string, any>>({
  request,
  schema,
  fieldName,
  returnType,
  info,
  args,
  transforms = [],
  transformedSchema,
  skipTypeMerging = false,
  onLocatedError,
}: IDelegateRequestOptions<TContext>): DelegationContext<TContext> {
  const operationDefinition = getOperationASTFromRequest(request);
  let targetFieldName: string;

  if (fieldName == null) {
    targetFieldName = (
      operationDefinition.selectionSet
        .selections[0] as unknown as FieldDefinitionNode
    ).name.value;
  } else {
    targetFieldName = fieldName;
  }

  const stitchingInfo = info?.schema.extensions?.['stitchingInfo'] as Maybe<
    StitchingInfo<TContext>
  >;

  const subschemaOrSubschemaConfig:
    | GraphQLSchema
    | SubschemaConfig<any, any, any, any> =
    stitchingInfo?.subschemaMap.get(schema) ?? schema;

  const operation = operationDefinition.operation;

  if (isSubschemaConfig(subschemaOrSubschemaConfig)) {
    const targetSchema = subschemaOrSubschemaConfig.schema;
    return {
      subschema: schema,
      subschemaConfig: subschemaOrSubschemaConfig,
      targetSchema,
      operation,
      fieldName: targetFieldName,
      context: request.context,
      info,
      returnType:
        returnType ??
        info?.returnType ??
        getDelegationReturnType(targetSchema, operation, targetFieldName),
      transforms:
        subschemaOrSubschemaConfig.transforms != null
          ? subschemaOrSubschemaConfig.transforms.concat(transforms)
          : transforms,
      transformedSchema,
      skipTypeMerging,
      onLocatedError,
      args,
    };
  }

  return {
    subschema: schema,
    subschemaConfig: undefined,
    targetSchema: subschemaOrSubschemaConfig,
    operation,
    fieldName: targetFieldName,
    context: request.context,
    info,
    returnType:
      returnType ??
      info?.returnType ??
      getDelegationReturnType(
        subschemaOrSubschemaConfig,
        operation,
        targetFieldName,
      ),
    transforms,
    transformedSchema: transformedSchema ?? subschemaOrSubschemaConfig,
    skipTypeMerging,
  };
}

function validateRequest(
  delegationContext: DelegationContext<any>,
  document: DocumentNode,
) {
  const errors = validate(delegationContext.targetSchema, document);
  if (errors.length > 0) {
    if (errors.length > 1) {
      const combinedError = new AggregateError(
        errors,
        errors.map((error) => error.message).join(', \n'),
      );
      throw combinedError;
    }
    const error = errors[0];
    if (error) {
      throw error.originalError || error;
    }
  }
}

const GLOBAL_CONTEXT = {};

function getExecutor<TContext extends Record<string, any>>(
  delegationContext: DelegationContext<TContext>,
): Executor<TContext> {
  const { subschemaConfig, targetSchema, context } = delegationContext;

  let executor: Executor =
    subschemaConfig?.executor || executorFromSchema(targetSchema);

  if (subschemaConfig?.batch) {
    const batchingOptions = subschemaConfig?.batchingOptions;
    executor = getBatchingExecutor(
      context ?? GLOBAL_CONTEXT,
      executor,
      batchingOptions?.dataLoaderOptions,
      batchingOptions?.extensionsReducer,
    );
  }

  return executor;
}

export { executorFromSchema as createDefaultExecutor };

function setObjectKeyPath(
  obj: Record<string, any>,
  path: Array<string | number>,
  value: any,
) {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (
      key == null ||
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype'
    ) {
      return;
    }
    if (current[key] == null) {
      current[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    current = current[key];
  }
  const lastKey = path[path.length - 1];
  if (
    lastKey == null ||
    lastKey === '__proto__' ||
    lastKey === 'constructor' ||
    lastKey === 'prototype'
  ) {
    return;
  }
  const existingValue = current[lastKey];
  current[lastKey] = existingValue ? mergeDeep([existingValue, value]) : value;
}
