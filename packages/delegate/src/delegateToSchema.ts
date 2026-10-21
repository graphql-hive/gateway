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
import {
  handleMaybePromise,
  mapAsyncIterator,
} from '@whatwg-node/promise-helpers';
import {
  DocumentNode,
  FieldDefinitionNode,
  FragmentDefinitionNode,
  getNullableType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  GraphQLSchema,
  isListType,
  isSchema,
  validate,
  type OperationTypeNode,
} from 'graphql';
import { applySchemaTransforms } from './applySchemaTransforms.js';
import { createRequest, getDelegatingOperation } from './createRequest.js';
import { IncrementalReceiver } from './IncrementalReceiver.js';
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
  const {
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
  } = options;

  let targetSchema;
  if (isSubschema(schema)) {
    targetSchema = schema.transformedSchema;
  } else if (isSchema(schema)) {
    targetSchema = schema;
  } else {
    const stitchingInfo = info.schema.extensions?.['stitchingInfo'] as Maybe<
      StitchingInfo<TContext>
    >;
    const subschema = stitchingInfo?.subschemaMap.get(schema);
    if (subschema != null) {
      targetSchema = subschema.transformedSchema;
    } else {
      targetSchema = applySchemaTransforms(schema.schema, schema);
    }
  }

  const fragments = info ? getFragmentDefinitions(info) : undefined;
  const targetRootType =
    operation === 'mutation'
      ? targetSchema.getMutationType()
      : operation === 'subscription'
        ? targetSchema.getSubscriptionType()
        : targetSchema.getQueryType();

  const request = createRequest({
    subgraphName: (schema as SubschemaConfig).name,
    fragments,
    targetSchema:
      targetRootType?.getFields()[fieldName] == null &&
      isSubschemaConfig(schema)
        ? schema.schema
        : targetSchema,
    rootValue: rootValue,
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
    targetSchema,
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
        const isQuery = delegationContext.operation === 'query';
        const isListReturn = isListType(
          getNullableType(delegationContext.returnType),
        );
        // Root @stream on the delegated field: yield list items one-by-one.
        // List return types with nested @defer (e.g. TransformQuery unwrap to
        // [[Book]]) must use IncrementalReceiver instead — otherwise the
        // AsyncIterable leaks to batch-delegate as `{}`.
        const isRootStream =
          isListReturn && fieldHasStreamDirective(delegationContext);

        if (isQuery && isRootStream) {
          return streamListIterable(
            executorResult,
            transformer,
          );
        }
        // Forwarded @defer from a defer-capable subschema: consume the initial
        // payload now and merge subsequent patches via IncrementalReceiver.
        // Runs for list return types too when the client deferred nested fields
        // rather than streaming the list itself.
        if (isQuery && delegationContext.subschemaConfig?.defer) {
          return consumeDeferredIterable(
            executorResult,
            transformer,
            delegationContext,
          );
        }
        if (isQuery && isListReturn) {
          // Legacy list AsyncIterable without defer config (stream-shaped).
          return streamListIterable(executorResult, transformer);
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
  targetSchema: transformedSchema,
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
    onLocatedError,
    args,
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
      batchingOptions?.defer ?? subschemaConfig.defer,
    );
  }

  return executor;
}

export { executorFromSchema as createDefaultExecutor };

async function consumeDeferredIterable<
  TContext extends Record<string, any>,
>(
  executorResult: AsyncIterable<ExecutionResult<any>>,
  transformer: Transformer<TContext>,
  delegationContext: DelegationContext<TContext>,
): Promise<any> {
  const iterator = executorResult[Symbol.asyncIterator]();
  const receiver = new IncrementalReceiver(delegationContext);

  // Pull until the initial payload for our field arrives (skip pending-only
  // chunks). Remaining patches are consumed in the background via for-await so
  // the initial value can flush before slow deferred fields resolve.
  let initialResult: ExecutionResult<any> | undefined;
  for (;;) {
    const step = await iterator.next();
    if (step.done) {
      receiver.finish();
      return null;
    }
    const data = step.value?.data?.[delegationContext.fieldName];
    if (data !== undefined || step.value?.hasNext === false) {
      initialResult = step.value;
      break;
    }
  }

  const initialValue = await transformer.transformResult(initialResult!);

  if (initialValue != null && typeof initialValue === 'object') {
    receiver.attachTo(initialValue);
    if (initialResult?.hasNext !== false) {
      // Run remaining chunks through transforms so structural transforms
      // (HoistField, WrapFields, …) rewrite patch shapes before merge.
      receiver.start(
        transformDeferredChunks(
          { [Symbol.asyncIterator]: () => iterator },
          transformer,
          delegationContext,
          initialValue as Record<string, any>,
        ),
      );
    } else {
      receiver.finish();
    }
  } else {
    receiver.finish();
  }

  return initialValue;
}

/**
 * Yield list items from an incremental @stream AsyncIterable one-by-one so
 * graphql-js can flush `initialCount` before later items arrive.
 */
async function* streamListIterable<TContext extends Record<string, any>>(
  executorResult: AsyncIterable<ExecutionResult<any>>,
  transformer: Transformer<TContext>,
): AsyncGenerator<any> {
  // Track how many items have been yielded to avoid re-yielding items that
  // have already been delivered. Some executors (e.g. the HTTP executor)
  // accumulate incremental results and return growing snapshots of the list
  // rather than individual incremental parts. Using an index counter instead
  // of a WeakSet supports both object and primitive (e.g. string) list items.
  let pushedCount = 0;
  for await (const result of executorResult) {
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
          yield await transformer.transformResult({ data });
        }
      }
      if (result.hasNext === false) {
        return;
      }
      continue;
    }
    const transformedResult = await transformer.transformResult(result);
    if (Array.isArray(transformedResult)) {
      for (let i = pushedCount; i < transformedResult.length; i++) {
        yield await transformedResult[i];
        pushedCount = i + 1;
      }
    } else {
      yield await transformedResult;
    }
  }
}

function fieldHasStreamDirective(
  delegationContext: DelegationContext<any>,
): boolean {
  const fieldNodes = delegationContext.info?.fieldNodes;
  if (fieldNodes == null) {
    return false;
  }
  for (const fieldNode of fieldNodes) {
    const directives = fieldNode.directives;
    if (directives == null) {
      continue;
    }
    for (let i = 0; i < directives.length; i++) {
      if (directives[i]!.name.value === 'stream') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Map subgraph incremental chunks through the same transform pipeline used for
 * the initial payload, so deferred patches land in gateway field shapes.
 */
async function* transformDeferredChunks<
  TContext extends Record<string, any>,
>(
  iterable: AsyncIterable<ExecutionResult<any>>,
  transformer: Transformer<TContext>,
  delegationContext: DelegationContext<TContext>,
  initialValue: Record<string, any>,
): AsyncIterable<ExecutionResult<any>> {
  const fieldName = delegationContext.fieldName;
  for await (const result of iterable) {
    if (result?.incremental?.length) {
      for (const patch of result.incremental) {
        if (patch.items != null) {
          // @stream list items: rewrite paths (TransformQuery unwrap) then
          // pass items through. Per-item result transforms are uncommon for
          // scalar streams; object-list items keep subgraph field shapes.
          const rewrittenPath =
            patch.path?.length != null
              ? applyErrorPathTransformers(
                  patch.path as Array<string | number>,
                  delegationContext,
                )
              : null;
          yield {
            incremental: [
              rewrittenPath != null ? { ...patch, path: rewrittenPath } : patch,
            ],
            hasNext: result.hasNext,
          };
          continue;
        }

        if (patch.data != null && patch.path?.length) {
          // TransformQuery.errorPathTransformer (and similar) rewrite patch
          // paths when resultTransformer unwraps nesting. Apply that first so
          // IncrementalReceiver merges into the already-unwrapped shape.
          const rewrittenPath = applyErrorPathTransformers(
            patch.path as Array<string | number>,
            delegationContext,
          );
          if (rewrittenPath != null) {
            yield {
              incremental: [
                {
                  ...patch,
                  path: rewrittenPath,
                },
              ],
              hasNext: result.hasNext,
            };
            continue;
          }

          const tree: Record<string, any> = {};
          setObjectKeyPath(
            tree,
            patch.path as Array<string | number>,
            { ...patch.data },
          );
          // Structural unwrap transforms (HoistField / MapFields) key off
          // __typename. Prefer the source type name HoistField was built with;
          // the gateway-facing initialValue may already carry a renamed type
          // (e.g. Shop_Product) that would skip unwrap.
          if (tree[fieldName] != null && typeof tree[fieldName] === 'object') {
            const typename = resolvePatchTypename(
              delegationContext,
              initialValue,
            );
            if (
              typename != null &&
              tree[fieldName]['__typename'] == null
            ) {
              tree[fieldName]['__typename'] = typename;
            }
          }

          try {
            const transformedValue = await transformer.transformResult({
              data: tree,
              errors: patch.errors,
            });
            if (transformedValue instanceof Error) {
              yield {
                incremental: [
                  {
                    path: [fieldName],
                    data: null,
                    errors: [transformedValue as any],
                  },
                ],
                hasNext: result.hasNext,
              };
            } else if (
              transformedValue != null &&
              typeof transformedValue === 'object'
            ) {
              // Merge as a full-field data update (not a raw patch) so
              // IncrementalReceiver fills only newly arrived gateway keys.
              yield {
                data: { [fieldName]: transformedValue },
                hasNext: result.hasNext,
              };
            } else {
              yield {
                incremental: [patch],
                hasNext: result.hasNext,
              };
            }
          } catch {
            // If transforms cannot reshape this patch, fall back to raw form.
            yield {
              incremental: [patch],
              hasNext: result.hasNext,
            };
          }
          continue;
        }

        // Error-only or empty data patches
        const rewrittenErrorPath =
          patch.path?.length != null
            ? applyErrorPathTransformers(
                patch.path as Array<string | number>,
                delegationContext,
              )
            : null;
        yield {
          incremental: [
            rewrittenErrorPath != null
              ? { ...patch, path: rewrittenErrorPath }
              : patch,
          ],
          hasNext: result.hasNext,
        };
      }
    } else if (result?.data) {
      try {
        const transformedValue = await transformer.transformResult(result);
        if (
          transformedValue != null &&
          typeof transformedValue === 'object' &&
          !(transformedValue instanceof Error)
        ) {
          yield {
            data: { [fieldName]: transformedValue },
            hasNext: result.hasNext,
          };
        }
      } catch {
        // ignore untransformable accumulated snapshots
      }
    } else if (result?.hasNext === false) {
      yield { hasNext: false };
    }
  }
}

/**
 * Rewrite incremental patch paths using TransformQuery-style
 * `errorPathTransformer`s (result transforms run right-to-left).
 * Returns a new path when such a transform matches; otherwise `null` so the
 * caller can fall back to tree + `transformResult` (HoistField, WrapFields…).
 */
function applyErrorPathTransformers(
  path: ReadonlyArray<string | number>,
  delegationContext: DelegationContext<any>,
): Array<string | number> | null {
  const transforms =
    delegationContext.transforms ??
    delegationContext.subschemaConfig?.transforms ??
    [];
  let next = path.slice() as Array<string | number>;
  let matched = false;
  for (let i = transforms.length - 1; i >= 0; i--) {
    const transform = transforms[i] as {
      path?: string[];
      errorPathTransformer?: (
        p: ReadonlyArray<string | number>,
      ) => Array<string | number>;
    };
    if (
      typeof transform.errorPathTransformer !== 'function' ||
      !Array.isArray(transform.path) ||
      transform.path.length === 0
    ) {
      continue;
    }
    const prefix = transform.path;
    let prefixMatches = true;
    for (let j = 0; j < prefix.length; j++) {
      if (next[j] !== prefix[j]) {
        prefixMatches = false;
        break;
      }
    }
    if (!prefixMatches) {
      continue;
    }
    matched = true;
    next = prefix.concat(
      transform.errorPathTransformer(next.slice(prefix.length)),
    );
  }
  return matched ? next : null;
}

/**
 * Pick a __typename that HoistField / MapFields unwrap transformers recognize.
 * Fall back to the already-transformed initial value's typename.
 */
function resolvePatchTypename<TContext extends Record<string, any>>(
  delegationContext: DelegationContext<TContext>,
  initialValue: Record<string, any>,
): string | undefined {
  const transforms =
    delegationContext.transforms ??
    delegationContext.subschemaConfig?.transforms ??
    [];
  for (const transform of transforms) {
    const hoist = transform as {
      typeName?: string;
      newFieldName?: string;
      pathToField?: unknown;
    };
    if (
      typeof hoist.typeName === 'string' &&
      typeof hoist.newFieldName === 'string' &&
      Array.isArray(hoist.pathToField)
    ) {
      return hoist.typeName;
    }
  }
  const fromInitial = initialValue['__typename'];
  return typeof fromInitial === 'string' ? fromInitial : undefined;
}

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
