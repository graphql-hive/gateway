import {
  createDefaultExecutor,
  delegateToSchema,
  FIELD_SUBSCHEMA_MAP_SYMBOL,
  mergeFields,
  OBJECT_SUBSCHEMA_SYMBOL,
  Subschema,
  UNPATHED_ERRORS_SYMBOL,
  type StitchingInfo,
} from '@graphql-tools/delegate';
// Annotation uses Symbol keys (JSON-invisible) via direct assign - cheaper than
// annotateExternalObject's Object.defineProperties on large entity lists.
import {
  CRITICAL_ERROR,
  getFragmentsFromDocument,
} from '@graphql-tools/executor';
import {
  ExecutionRequest,
  ExecutionResult,
  getDefinedRootType,
  getOperationASTFromRequest,
  mergeDeep,
  relocatedError,
} from '@graphql-tools/utils';
import {
  handleMaybePromise,
  isPromise,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';
import {
  FieldNode,
  getArgumentValues,
  getNamedType,
  GraphQLError,
  GraphQLOutputType,
  GraphQLSchema,
  isInterfaceType,
  isNullableType,
  isObjectType,
  Kind,
  OperationTypeNode,
  SelectionNode,
  SelectionSetNode,
  VariableDefinitionNode,
  visit,
} from 'graphql';
import { getBatchedMergeEntry } from './mergeEntry.js';
import {
  BACKBONE_EXECUTING,
  getOriginalRootResolve,
} from './rootProxyingResolvers.js';
import type {
  BackboneExecutionContext,
  PathSegment,
  StitchPlan,
  StitchPlanNode,
} from './types.js';

/** Same key as stitchSchemas wrap - skip classic mergeFields after plan hop. */
const BACKBONE_HYDRATED = Symbol.for('graphql-tools.stitch.backboneHydrated');

/**
 * Subgraph executor as configured on the Subschema. Gateway/fusion already
 * wraps with getBatchingExecutor when `batch` is enabled - do not re-wrap.
 */
function getSubschemaExecutor(subschema: Subschema) {
  return subschema.executor ?? createDefaultExecutor(subschema.schema);
}

/**
 * Hive Parallel pattern: only real promises enter `Promise.all`. Sync
 * completions stay sync - never `Promise.resolve` every job (extra microtasks).
 */
function awaitMaybePromises(
  jobs: ReadonlyArray<MaybePromise<unknown>>,
): MaybePromise<void> {
  const promises: PromiseLike<unknown>[] = [];
  for (const job of jobs) {
    if (isPromise(job)) {
      promises.push(job);
    }
  }
  if (promises.length === 0) {
    return;
  }
  if (promises.length === 1) {
    return Promise.resolve(promises[0]!).then(() => {
      /* drain */
    });
  }
  return Promise.all(promises).then(() => {
    /* drain */
  });
}

/**
 * Like `awaitMaybePromises` but preserves per-job values. Sync slots are kept
 * as-is; only promise slots are awaited and filled back by index.
 */
function allMaybePromises<T>(
  jobs: ReadonlyArray<MaybePromise<T>>,
): MaybePromise<T[]> {
  const results: T[] = new Array(jobs.length);
  const promises: PromiseLike<T>[] = [];
  const indices: number[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    if (isPromise(job)) {
      promises.push(job);
      indices.push(i);
    } else {
      results[i] = job as T;
    }
  }
  if (promises.length === 0) {
    return results;
  }
  return Promise.all(promises).then((resolved) => {
    for (let k = 0; k < resolved.length; k++) {
      results[indices[k]!] = resolved[k]!;
    }
    return results;
  });
}

/** Stamp subschema symbols without Object.defineProperties. */
function stampSubschema(
  object: Record<string, any>,
  subschema: Subschema,
  errors?: readonly any[],
): void {
  (object as any)[OBJECT_SUBSCHEMA_SYMBOL] = subschema;
  if ((object as any)[FIELD_SUBSCHEMA_MAP_SYMBOL] == null) {
    // Per-object map: mergeFields writes responseKey -> subschema entries.
    (object as any)[FIELD_SUBSCHEMA_MAP_SYMBOL] = Object.create(null);
  }
  if ((object as any)[UNPATHED_ERRORS_SYMBOL] == null) {
    (object as any)[UNPATHED_ERRORS_SYMBOL] = errors?.length ? [...errors] : [];
  } else if (errors?.length) {
    (object as any)[UNPATHED_ERRORS_SYMBOL] = [...errors];
  }
}

/**
 * Concrete root/list payloads omit planner-injected `__typename` in the outbound
 * query; stamp the known object type so later entity hops can match parents.
 */
function stampConcreteTypename(
  value: any,
  returnType: GraphQLOutputType,
): void {
  const named = getNamedType(returnType);
  if (!isObjectType(named)) {
    return;
  }
  if (value == null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      stampConcreteTypename(item, named);
    }
    return;
  }
  if (typeof value === 'object' && value.__typename == null) {
    value.__typename = named.name;
  }
}

/**
 * Locate subgraph / plugin errors onto the gateway root field path (classic
 * checkResultAndHandleErrors parity). Preserve plugin extensions (COST_*).
 */
function locateRootFieldErrors(
  errors: readonly GraphQLError[],
  responseKey: string,
  _fieldNode: FieldNode,
): GraphQLError[] {
  return errors.map((error) => {
    if (error.path?.length) {
      if (error.path[0] === responseKey) {
        return error;
      }
      return relocatedError(error, [responseKey, ...error.path]);
    }
    // Preserve original nodes/locations (often absent for transport errors);
    // only attach the gateway path - classic checkResultAndHandleErrors parity.
    return new GraphQLError(error.message, {
      originalError: error,
      nodes: error.nodes,
      source: error.source,
      positions: error.positions,
      path: [responseKey],
      extensions: error.extensions,
    });
  });
}

function isGraphQLErrorLike(err: unknown): err is GraphQLError {
  return (
    err instanceof GraphQLError ||
    (typeof err === 'object' &&
      err != null &&
      typeof (err as { message?: unknown }).message === 'string' &&
      'extensions' in err)
  );
}

/**
 * Preserve GraphQLError extensions from onSubgraphExecute plugins (demand
 * control COST_*). Only synthesize DOWNSTREAM_SERVICE_ERROR for unknown throws.
 */
function errorFromFetchThrow(
  err: unknown,
  subschema: Subschema,
  responseKey: string,
  fieldNode?: FieldNode,
): GraphQLError {
  if (err instanceof GraphQLError || isGraphQLErrorLike(err)) {
    const gqlErr = err as GraphQLError;
    return new GraphQLError(gqlErr.message, {
      originalError: gqlErr instanceof Error ? gqlErr : undefined,
      nodes: gqlErr.nodes?.length
        ? gqlErr.nodes
        : fieldNode
          ? [fieldNode]
          : undefined,
      source: gqlErr.source,
      positions: gqlErr.positions,
      path: gqlErr.path?.length ? gqlErr.path : [responseKey],
      extensions: gqlErr.extensions,
    });
  }
  return new GraphQLError(err instanceof Error ? err.message : String(err), {
    originalError: err instanceof Error ? err : undefined,
    nodes: fieldNode ? [fieldNode] : undefined,
    path: [responseKey],
    extensions: {
      code: 'DOWNSTREAM_SERVICE_ERROR',
      serviceName: subschema.name,
    },
  });
}

/** After plan execute: fill missing nullable roots with null; bubble non-null. */
function finalizeRootResult(ctx: BackboneExecutionContext): ExecutionResult {
  const rootType = getDefinedRootType(ctx.schema, ctx.operation.operation);
  const data: Record<string, any> = { ...ctx.data };
  let nullWhole = false;

  for (const sel of ctx.operation.selectionSet.selections) {
    if (sel.kind !== Kind.FIELD) {
      continue;
    }
    const fieldName = sel.name.value;
    if (fieldName.startsWith('__')) {
      continue;
    }
    const field = rootType.getFields()[fieldName];
    if (!field) {
      continue;
    }
    const responseKey = sel.alias?.value ?? fieldName;
    const hasFieldError = ctx.errors.some((e) => {
      const path = (e as GraphQLError).path;
      return !path?.length || path[0] === responseKey;
    });
    const missing = !(responseKey in data) || data[responseKey] === undefined;
    if (missing && hasFieldError) {
      if (!isNullableType(field.type)) {
        nullWhole = true;
      } else {
        data[responseKey] = null;
      }
    } else if (data[responseKey] === null && !isNullableType(field.type)) {
      nullWhole = true;
    }
  }

  const result: ExecutionResult = {};
  if (nullWhole) {
    result.data = null;
  } else if (Object.keys(data).length) {
    result.data = data;
  } else if (!ctx.errors.length) {
    // All root fields skipped via @skip/@include Condition - graphql-js
    // still returns an empty data object.
    result.data = {};
  }
  if (ctx.errors.length) {
    // CRITICAL_ERROR is an internal invariant (e.g. iface-field filter miss /
    // corrupted key). When the path still has an object (even empty), do not
    // leak it - classic never surfaced these next to successful data.
    const clientErrors = ctx.errors.filter((error) => {
      if (!(error as GraphQLError).extensions?.[CRITICAL_ERROR]) {
        return true;
      }
      const key = (error as GraphQLError).path?.[0];
      return key == null || data[key as string] == null;
    });
    if (clientErrors.length) {
      result.errors = clientErrors as any;
    }
  }
  return result;
}

/**
 * Deep-annotate a Fetch payload once so nested objects carry
 * OBJECT_SUBSCHEMA_SYMBOL for later entity hops.
 */
function annotateValue(
  value: any,
  errors: readonly any[],
  subschema: Subschema,
): any {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => annotateValue(item, errors, subschema));
  }
  stampSubschema(value, subschema, errors);
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (child != null && typeof child === 'object') {
      annotateValue(child, [], subschema);
    }
  }
  return value;
}

/**
 * Prefer concrete object __typename over @interfaceObject interface names.
 */
function resolveMergedTypename(
  priorTypename: string | undefined,
  resultTypename: string | undefined,
  schema: GraphQLSchema,
): string | undefined {
  if (!resultTypename) {
    return priorTypename;
  }
  if (!priorTypename || priorTypename === resultTypename) {
    return resultTypename;
  }
  const priorType = schema.getType(priorTypename);
  const resultType = schema.getType(resultTypename);
  if (isObjectType(priorType) && isInterfaceType(resultType)) {
    return priorTypename;
  }
  if (isInterfaceType(priorType) && isObjectType(resultType)) {
    return resultTypename;
  }
  return resultTypename;
}

/**
 * Light entity merge - Hive `mergeFlattenEntities`:
 * `Object.assign(target, mergeDeep([target, entity]))` for nested payloads;
 * leaf-only hops skip mergeDeep and assign fields directly.
 */
function mergeEntityIntoParent(
  parent: Record<string, any>,
  resolverResult: Record<string, any>,
  schema: GraphQLSchema,
  subschema: Subschema,
): void {
  let hasNested = false;
  for (const key in resolverResult) {
    if (key === '__typename') {
      continue;
    }
    const v = resolverResult[key];
    if (v != null && typeof v === 'object') {
      hasNested = true;
      break;
    }
  }
  const priorTypename = parent['__typename'] as string | undefined;
  const resultTypename = resolverResult['__typename'] as string | undefined;
  if (!hasNested) {
    for (const key in resolverResult) {
      if (
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype' ||
        key === '__typename'
      ) {
        continue;
      }
      parent[key] = resolverResult[key];
    }
    parent['__typename'] = resolveMergedTypename(
      priorTypename,
      resultTypename,
      schema,
    );
    stampSubschema(parent, subschema);
    return;
  }
  // Nested: Hive Object.assign + mergeDeep, then stamp symbols (mergeDeep
  // copies enumerable props only).
  const merged = mergeDeep([parent, resolverResult], false, true, true);
  Object.assign(parent, merged);
  parent['__typename'] = resolveMergedTypename(
    priorTypename,
    resultTypename,
    schema,
  );
  stampSubschema(parent, subschema);
  // Annotate fresh nested objects from the hop so later entity hops can find
  // OBJECT_SUBSCHEMA_SYMBOL on children.
  for (const key in resolverResult) {
    if (key === '__typename') {
      continue;
    }
    const v = parent[key];
    if (v != null && typeof v === 'object') {
      annotateValue(v, [], subschema);
    }
  }
}

/**
 * Merge Parallel shared-root Fetch results into one object/list. Preserves
 * external-object symbols from the left-hand side when both sides are objects.
 */
function mergeRootValues(existing: any, incoming: any): any {
  if (existing == null) {
    return incoming;
  }
  if (incoming == null) {
    return existing;
  }
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const len = Math.max(existing.length, incoming.length);
    const out: any[] = new Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = mergeRootValues(existing[i], incoming[i]);
    }
    return out;
  }
  if (
    typeof existing === 'object' &&
    typeof incoming === 'object' &&
    !Array.isArray(existing) &&
    !Array.isArray(incoming)
  ) {
    // mergeDeep copies enumerable props; re-apply annotation symbols from either side.
    const merged = mergeDeep([existing, incoming], undefined, true, true);
    const sourceSub =
      (existing as any)[OBJECT_SUBSCHEMA_SYMBOL] ??
      (incoming as any)[OBJECT_SUBSCHEMA_SYMBOL];
    if (sourceSub && merged && typeof merged === 'object') {
      stampSubschema(merged, sourceSub);
      const leftMap = (existing as any)[FIELD_SUBSCHEMA_MAP_SYMBOL];
      const rightMap = (incoming as any)[FIELD_SUBSCHEMA_MAP_SYMBOL];
      if (leftMap || rightMap) {
        (merged as any)[FIELD_SUBSCHEMA_MAP_SYMBOL] = {
          ...rightMap,
          ...leftMap,
        };
      }
    }
    return merged;
  }
  return incoming;
}

/** Drop @skip/@include - already evaluated at plan time. */

function collectUsedVariableNames(node: SelectionNode): Set<string> {
  const used = new Set<string>();
  visit(node, {
    Variable(v) {
      used.add(v.name.value);
    },
  });
  return used;
}

function filterVariableDefinitions(
  defs: readonly VariableDefinitionNode[] | undefined,
  used: Set<string>,
): VariableDefinitionNode[] | undefined {
  if (!defs?.length) {
    return undefined;
  }
  const filtered = defs.filter((d) => used.has(d.variable.name.value));
  return filtered.length ? filtered : undefined;
}

/**
 * When sibling inline fragments select the same field with conflicting
 * nullability (User.id: ID! vs Admin.id: ID), rewrite with `_nullable_` /
 * `_nonNullable_` aliases - same as finalizeGatewayRequest.
 */
function rewriteNullabilityConflicts(
  selectionSet: SelectionSetNode,
  schema: GraphQLSchema,
): SelectionSetNode {
  const seenNonNullable = new Set<string>();
  const seenNullable = new Set<string>();
  const selections = selectionSet.selections.map((sel) => {
    if (sel.kind !== Kind.INLINE_FRAGMENT || !sel.typeCondition) {
      if (sel.kind === Kind.FIELD && sel.selectionSet) {
        return {
          ...sel,
          selectionSet: rewriteNullabilityConflicts(sel.selectionSet, schema),
        };
      }
      return sel;
    }
    const type = schema.getType(sel.typeCondition.name.value);
    if (!type || !('getFields' in type) || !sel.selectionSet) {
      return sel;
    }
    const fields = (type as import('graphql').GraphQLObjectType).getFields();
    const nextSels = sel.selectionSet.selections.map((sub) => {
      if (sub.kind !== Kind.FIELD || sub.alias) {
        if (sub.kind === Kind.FIELD && sub.selectionSet) {
          return {
            ...sub,
            selectionSet: rewriteNullabilityConflicts(sub.selectionSet, schema),
          };
        }
        return sub;
      }
      const field = fields[sub.name.value];
      if (!field) {
        return sub;
      }
      const nullable = isNullableType(field.type);
      if (nullable) {
        seenNullable.add(sub.name.value);
      } else {
        seenNonNullable.add(sub.name.value);
      }
      if (
        seenNullable.has(sub.name.value) &&
        seenNonNullable.has(sub.name.value)
      ) {
        return {
          ...sub,
          alias: {
            kind: Kind.NAME as const,
            value: nullable
              ? `_nullable_${sub.name.value}`
              : `_nonNullable_${sub.name.value}`,
          },
          selectionSet: sub.selectionSet
            ? rewriteNullabilityConflicts(sub.selectionSet, schema)
            : undefined,
        };
      }
      return sub.selectionSet
        ? {
            ...sub,
            selectionSet: rewriteNullabilityConflicts(sub.selectionSet, schema),
          }
        : sub;
    });
    return {
      ...sel,
      selectionSet: { ...sel.selectionSet, selections: nextSels },
    };
  });
  return { ...selectionSet, selections };
}

/** Map `_nullable_id` / `_nonNullable_id` response keys back to `id`. */
function unwrapNullabilityAliases(value: any): any {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(unwrapNullabilityAliases);
  }
  const out: Record<string, any> = {};
  for (const [key, v] of Object.entries(value)) {
    const unwrapped = key.startsWith('_nullable_')
      ? key.slice('_nullable_'.length)
      : key.startsWith('_nonNullable_')
        ? key.slice('_nonNullable_'.length)
        : key;
    out[unwrapped] = unwrapNullabilityAliases(v);
  }
  return out;
}

function buildRootDocument(
  operationName: string | undefined,
  operationType: OperationTypeNode,
  fieldNode: FieldNode,
  variableDefinitions: StitchPlan['operation']['variableDefinitions'],
  variableValues: Record<string, any>,
  targetSchema?: GraphQLSchema,
) {
  // Keep nested @skip/@include - subgraph evaluates them (Condition / peel
  // already decided which root fields run).
  let cleaned = fieldNode;
  if (targetSchema && cleaned.selectionSet) {
    cleaned = {
      ...cleaned,
      selectionSet: rewriteNullabilityConflicts(
        cleaned.selectionSet,
        targetSchema,
      ),
    };
  }
  const usedVars = collectUsedVariableNames(cleaned);
  const filteredDefs = filterVariableDefinitions(variableDefinitions, usedVars);
  const filteredVars: Record<string, any> = {};
  for (const name of usedVars) {
    if (name in variableValues) {
      filteredVars[name] = variableValues[name];
    }
  }
  const op = {
    kind: Kind.OPERATION_DEFINITION as const,
    operation: operationType,
    name: operationName
      ? { kind: Kind.NAME as const, value: operationName }
      : undefined,
    variableDefinitions: filteredDefs,
    selectionSet: {
      kind: Kind.SELECTION_SET as const,
      selections: [cleaned],
    },
  };
  return {
    document: {
      kind: Kind.DOCUMENT as const,
      definitions: [op],
    },
    variables: filteredVars,
  };
}

function collectEntitiesAtPath(
  data: any,
  path: PathSegment[],
): Array<Record<string, any>> {
  let current: any[] = [data];
  for (const segment of path) {
    const next: any[] = [];
    for (const item of current) {
      if (item == null) {
        continue;
      }
      if (typeof segment === 'number') {
        if (Array.isArray(item)) {
          const el = item[segment];
          if (el != null) {
            next.push(el);
          }
        }
        continue;
      }
      const value = item[segment];
      if (Array.isArray(value)) {
        for (const el of value) {
          if (el != null && typeof el === 'object') {
            next.push(el);
          }
        }
      } else if (value != null && typeof value === 'object') {
        next.push(value);
      }
    }
    current = next;
  }
  return current;
}

function executeFetchNode(
  node: Extract<StitchPlanNode, { kind: 'Fetch' }>,
  ctx: BackboneExecutionContext,
): MaybePromise<void> {
  const executor = getSubschemaExecutor(node.subschema);

  if (node.rootField) {
    const responseKey =
      node.rootField.alias?.value ?? node.rootField.name.value;
    const rootFieldNode = node.rootField;
    const writeRootResult = (
      value: any,
      errors: readonly GraphQLError[] = [],
    ) => {
      if (errors.length) {
        ctx.errors.push(
          ...locateRootFieldErrors(
            errors as GraphQLError[],
            responseKey,
            rootFieldNode,
          ),
        );
      }
      if (value !== undefined) {
        const annotated = annotateValue(
          unwrapNullabilityAliases(value),
          errors,
          node.subschema,
        );
        if (annotated != null) {
          const rootType = getDefinedRootType(
            ctx.schema,
            ctx.operation.operation,
          );
          const fieldDef = rootType.getFields()[rootFieldNode.name.value];
          if (fieldDef) {
            stampConcreteTypename(annotated, fieldDef.type);
          }
        }
        if (responseKey in ctx.data) {
          ctx.data[responseKey] = mergeRootValues(
            ctx.data[responseKey],
            annotated,
          );
        } else {
          ctx.data[responseKey] = annotated;
        }
      } else if (errors.length && !(responseKey in ctx.data)) {
        // Subgraph down / errors-only result: expose null for the root key
        // so finalizeRootResult can apply nullability bubbling.
        ctx.data[responseKey] = null;
      }
    };

    // Rename / encapsulate / defer transforms need Transformer - prebuilt
    // documents use gateway field names and would miss subgraph renames.
    if (node.subschema.transforms?.length) {
      const hopSubschema = node.subschema;
      const rootType = getDefinedRootType(ctx.schema, ctx.operation.operation);
      const fieldDef = rootType.getFields()[rootFieldNode.name.value];
      const args = fieldDef
        ? getArgumentValues(fieldDef, rootFieldNode, ctx.variableValues)
        : {};
      const info = {
        ...(ctx.infoStub as any),
        schema: ctx.schema,
        parentType: rootType,
        returnType: fieldDef?.type,
        fieldName: rootFieldNode.name.value,
        fieldNodes: [rootFieldNode],
        fragments: ctx.fragments,
        operation: ctx.operation,
        variableValues: ctx.variableValues,
        path: { typename: rootType.name, key: responseKey, prev: undefined },
        rootValue: ctx.rootValue,
      };
      return handleMaybePromise(
        () =>
          delegateToSchema({
            schema: hopSubschema,
            operation: ctx.operation.operation,
            fieldName: rootFieldNode.name.value,
            args,
            selectionSet: rootFieldNode.selectionSet,
            context: ctx.contextValue,
            info: info as any,
            skipTypeMerging: true,
          }),
        (value) => writeRootResult(value),
        (err) => {
          ctx.errors.push(
            errorFromFetchThrow(
              err,
              node.subschema,
              responseKey,
              rootFieldNode,
            ),
          );
          if (!(responseKey in ctx.data)) {
            ctx.data[responseKey] = null;
          }
        },
      );
    }

    let document = node.document;
    let variables: Record<string, any>;
    if (document) {
      variables = {};
      const op = document.definitions.find(
        (d) => d.kind === Kind.OPERATION_DEFINITION,
      );
      for (const def of op?.variableDefinitions ?? []) {
        const name = def.variable.name.value;
        if (name in ctx.variableValues) {
          variables[name] = ctx.variableValues[name];
        }
      }
    } else {
      const built = buildRootDocument(
        ctx.operation.name?.value,
        ctx.operation.operation,
        node.rootField,
        ctx.operation.variableDefinitions,
        ctx.variableValues,
        node.subschema.schema,
      );
      document = built.document;
      variables = built.variables;
    }
    return handleMaybePromise(
      () =>
        executor({
          document,
          variables,
          context: ctx.contextValue,
          rootValue: ctx.rootValue,
          operationType: ctx.operation.operation,
          operationName: ctx.operation.name?.value,
          signal: ctx.signal,
          subgraphName: node.subschema.name,
        } satisfies ExecutionRequest) as MaybePromise<ExecutionResult>,
      (result: ExecutionResult) => {
        const located = result.errors?.length
          ? (result.errors as GraphQLError[])
          : [];
        if (result.data && responseKey in result.data) {
          writeRootResult(result.data[responseKey], located);
        } else {
          writeRootResult(undefined, located);
        }
      },
      (err) => {
        ctx.errors.push(
          errorFromFetchThrow(err, node.subschema, responseKey, rootFieldNode),
        );
        if (!(responseKey in ctx.data)) {
          ctx.data[responseKey] = null;
        }
      },
    );
  }

  const flattenPaths =
    node.flattenPaths ?? (node.flattenPath != null ? [node.flattenPath] : null);
  if (!node.entityTypeName || !flattenPaths?.length) {
    return;
  }

  // Cast/Flatten: hydrate parents matching this entity type, including
  // concrete implementers of an @interfaceObject interface (User -> NodeWithName).
  const entityType = ctx.schema.getType(node.entityTypeName);
  const matchParent = (p: Record<string, any>) => {
    if (p == null) {
      return false;
    }
    if (p['__typename'] === node.entityTypeName) {
      return true;
    }
    // Typeless parents: only valid for @interfaceObject interface hops.
    // Concrete Cast (Cat vs Dog) must not claim every typeless list item.
    if (p['__typename'] == null) {
      return isInterfaceType(entityType);
    }
    if (!isInterfaceType(entityType)) {
      return false;
    }
    const runtime = ctx.schema.getType(p['__typename']);
    return (
      isObjectType(runtime) &&
      runtime.getInterfaces().some((i) => i.name === node.entityTypeName)
    );
  };
  const parents: Array<Record<string, any>> = [];
  const seen = new Set<Record<string, any>>();
  for (const path of flattenPaths) {
    for (const p of collectEntitiesAtPath(ctx.data, path)) {
      if (matchParent(p) && !seen.has(p)) {
        seen.add(p);
        parents.push(p);
      }
    }
  }
  if (!parents.length) {
    return;
  }

  const stitchingInfo = ctx.schema.extensions?.['stitchingInfo'] as
    StitchingInfo | undefined;
  const mergedTypeInfo = stitchingInfo?.mergedTypes[node.entityTypeName];
  if (!mergedTypeInfo) {
    return;
  }

  const type = ctx.schema.getType(node.entityTypeName);
  // Object types and @interfaceObject interfaces both carry merge resolvers.
  if (!isObjectType(type) && !isInterfaceType(type)) {
    return;
  }

  // Execute the planned target directly (router-style Fetch), instead of
  // re-running delegationPlanBuilder which can mark the hop non-proxiable
  // based on source *schema* keys even when the parent object already has them.
  const resolver = mergedTypeInfo.resolvers.get(node.subschema);
  if (!resolver) {
    // Fall back to mergeFields when no explicit merge resolver is registered.
    const planningParentField: FieldNode = {
      kind: Kind.FIELD,
      name: { kind: Kind.NAME, value: node.entityTypeName },
      selectionSet: node.selectionSet,
    };
    const jobs: MaybePromise<any>[] = [];
    for (const parent of parents) {
      const sourceSubschema =
        ((parent as any)[OBJECT_SUBSCHEMA_SYMBOL] as Subschema | undefined) ??
        node.subschema;
      const info = {
        ...(ctx.infoStub as any),
        schema: ctx.schema,
        parentType: type,
        returnType: type,
        fieldName: node.entityTypeName,
        fieldNodes: [planningParentField],
        fragments: ctx.fragments,
        operation: ctx.operation,
        variableValues: ctx.variableValues,
        path: {
          typename: node.entityTypeName,
          key: flattenPaths[0]!.at(-1),
          prev: undefined,
        },
      };
      jobs.push(
        mergeFields(
          mergedTypeInfo,
          parent,
          sourceSubschema,
          ctx.contextValue,
          info,
          [planningParentField],
        ),
      );
    }
    return handleMaybePromise(
      () => awaitMaybePromises(jobs),
      () => {
        for (const parent of parents) {
          stampSubschema(parent, node.subschema);
        }
      },
    );
  }

  const info = {
    ...(ctx.infoStub as any),
    schema: ctx.schema,
    parentType: type,
    returnType: type,
    fieldName: node.entityTypeName,
    fieldNodes: [
      {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: node.entityTypeName },
        selectionSet: node.selectionSet,
      },
    ],
    fragments: ctx.fragments,
    operation: ctx.operation,
    variableValues: ctx.variableValues,
    path: {
      typename: node.entityTypeName,
      key: flattenPaths[0]!.at(-1),
      prev: undefined,
    },
  };

  const hopSubschema = node.subschema;

  // Hive-style: one batched _entities hop for all parents (single
  // batchDelegateToSchema / DataLoader batch instead of N resolver entries).
  const batched = tryExecuteEntitiesBatch(node, parents, hopSubschema, ctx);
  if (batched !== undefined) {
    return batched;
  }

  const jobs: MaybePromise<any>[] = parents.map((parent) =>
    handleMaybePromise(
      () =>
        resolver(
          parent,
          ctx.contextValue,
          info,
          hopSubschema,
          node.selectionSet,
          undefined,
          type as any,
        ),
      (resolverResult) => {
        if (resolverResult == null || typeof resolverResult !== 'object') {
          return;
        }
        if (resolverResult instanceof Error) {
          ctx.errors.push(resolverResult);
          return;
        }
        // mutate parent in place so siblings sharing the tree see updates
        mergeEntityIntoParent(
          parent,
          resolverResult as Record<string, any>,
          ctx.schema,
          node.subschema,
        );
      },
    ),
  );

  return handleMaybePromise(
    () => awaitMaybePromises(jobs),
    () => undefined,
  );
}

/**
 * Batched type-merge hop: project keys once, one merge-field call for all
 * parents, index-merge. Uses MergedTypeConfig (`fieldName`/`argsFromKeys`) -
 * federation `_entities` or plain stitching `usersByIds` alike.
 */
function tryExecuteEntitiesBatch(
  node: Extract<StitchPlanNode, { kind: 'Fetch' }>,
  parents: Array<Record<string, any>>,
  hopSubschema: Subschema,
  ctx: BackboneExecutionContext,
): MaybePromise<void> | undefined {
  const typeName = node.entityTypeName!;
  const entry = getBatchedMergeEntry(hopSubschema, typeName);
  if (!entry) {
    return undefined;
  }

  const keyFn = entry.key;
  const cacheKeyFn = entry.dataLoaderOptions?.cacheKeyFn;
  const keys: any[] = [];
  const identityToIndex = new Map<string, number>();
  const parentKeyIndex: number[] = new Array(parents.length);
  for (let i = 0; i < parents.length; i++) {
    const key = keyFn(parents[i]!);
    if (key == null) {
      parentKeyIndex[i] = -1;
      continue;
    }
    const identity =
      cacheKeyFn != null ? String(cacheKeyFn(key)) : JSON.stringify(key);
    let idx = identityToIndex.get(identity);
    if (idx == null) {
      idx = keys.length;
      identityToIndex.set(identity, idx);
      keys.push(key);
    }
    parentKeyIndex[i] = idx;
  }
  if (!keys.length) {
    return undefined;
  }

  const mergeResults = (results: any) => {
    if (!Array.isArray(results)) {
      if (results instanceof Error) {
        ctx.errors.push(results);
      }
      return;
    }
    for (let i = 0; i < parents.length; i++) {
      const ki = parentKeyIndex[i]!;
      if (ki < 0) {
        continue;
      }
      const entity = results[ki];
      if (entity instanceof Error) {
        ctx.errors.push(entity);
        continue;
      }
      if (entity == null || typeof entity !== 'object') {
        continue;
      }
      mergeEntityIntoParent(
        parents[i]!,
        entity as Record<string, any>,
        ctx.schema,
        node.subschema,
      );
    }
  };

  // Prebuilt document skips Transformer - only safe for leaf-only selections
  // (inventory/username style). Nested selections (field args, deep merges)
  // fall through to per-parent merge resolvers so batchDelegate DataLoader
  // keys include field arguments (sharedRootValue / sortBy memoization).
  if (!(node.document && isLeafOnlySelection(node.selectionSet))) {
    return undefined;
  }
  const args = entry.argsFromKeys(keys) as Record<string, any>;
  const executor = getSubschemaExecutor(hopSubschema);
  return handleMaybePromise(
    () =>
      executor({
        document: node.document!,
        variables: args,
        context: ctx.contextValue,
        rootValue: ctx.rootValue,
        operationType: OperationTypeNode.QUERY,
        signal: ctx.signal,
        subgraphName: hopSubschema.name,
      } satisfies ExecutionRequest) as MaybePromise<ExecutionResult>,
    (result: ExecutionResult) => {
      if (result.errors?.length) {
        ctx.errors.push(...result.errors);
      }
      mergeResults(result.data?.[entry.fieldName]);
    },
  );
}

function executeIslandNode(
  node: Extract<StitchPlanNode, { kind: 'Island' }>,
  ctx: BackboneExecutionContext,
): MaybePromise<void> {
  const parentType = ctx.schema.getType(node.parentTypeName);
  if (!isObjectType(parentType) && !isInterfaceType(parentType)) {
    return;
  }
  const fieldName = node.fieldNode.name.value;
  const responseKey = node.fieldNode.alias?.value ?? fieldName;

  // Meta-field: no GraphQLField.resolve on the type.
  if (fieldName === '__typename') {
    ctx.data[responseKey] = node.parentTypeName;
    return;
  }

  const field = parentType.getFields()[fieldName];
  if (!field?.resolve) {
    return;
  }
  // Root Islands must bypass backboneRootProxyingResolver (would join the
  // in-flight plan and deadlock). Nested Islands keep field.resolve (wraps).
  const rootType = getDefinedRootType(ctx.schema, ctx.operation.operation);
  const isRootIsland = parentType === rootType;
  const resolve =
    (isRootIsland ? getOriginalRootResolve(field) : undefined) ?? field.resolve;
  const args = getArgumentValues(field, node.fieldNode, ctx.variableValues);

  const flattenPaths =
    node.flattenPaths ?? (node.flattenPath != null ? [node.flattenPath] : null);

  // Nested Island: resolve on every parent object at the flatten path(s).
  if (flattenPaths?.length) {
    const parents: Array<Record<string, any>> = [];
    const seen = new Set<Record<string, any>>();
    for (const path of flattenPaths) {
      for (const p of collectEntitiesAtPath(ctx.data, path)) {
        if (p != null && typeof p === 'object' && !seen.has(p)) {
          seen.add(p);
          parents.push(p);
        }
      }
    }
    if (!parents.length) {
      return;
    }
    const jobs = parents.map((parent) => {
      const info = {
        ...(ctx.infoStub as any),
        schema: ctx.schema,
        parentType,
        returnType: field.type,
        fieldName,
        fieldNodes: [node.fieldNode],
        fragments: ctx.fragments,
        operation: ctx.operation,
        variableValues: ctx.variableValues,
        path: {
          typename: node.parentTypeName,
          key: responseKey,
          prev: undefined,
        },
      };
      return handleMaybePromise(
        () => resolve!(parent, args, ctx.contextValue, info),
        (result) => {
          parent[responseKey] = result;
        },
      );
    });
    // `continue` is a separate dataflow hop gated on this Island's id -
    // do not tree-walk it here (would double-execute).
    return awaitMaybePromises(jobs);
  }

  // Root Island: write into ctx.data[responseKey].
  const info = {
    ...(ctx.infoStub as any),
    schema: ctx.schema,
    parentType: rootType,
    returnType: field.type,
    fieldName,
    fieldNodes: [node.fieldNode],
    fragments: ctx.fragments,
    operation: ctx.operation,
    variableValues: ctx.variableValues,
    path: { typename: rootType.name, key: responseKey, prev: undefined },
  };

  return handleMaybePromise(
    () => resolve!(ctx.rootValue, args, ctx.contextValue, info),
    (result) => {
      ctx.data[responseKey] = result;
      // continue: dataflow hop, not tree execute
    },
  );
}

type ExecutableHop =
  | Extract<StitchPlanNode, { kind: 'Fetch' }>
  | Extract<StitchPlanNode, { kind: 'BatchFetch' }>
  | Extract<StitchPlanNode, { kind: 'Island' }>;

/**
 * Collect hops for one execution. Condition picks a single branch from
 * variables (never both). Island is a hop; its continue is queued after.
 */
function collectExecutableHops(
  node: StitchPlanNode,
  out: ExecutableHop[],
  variableValues: Record<string, any>,
): void {
  if (
    node.kind === 'Fetch' ||
    node.kind === 'BatchFetch' ||
    node.kind === 'Island'
  ) {
    out.push(node);
    if (node.kind === 'Island' && node.continue) {
      collectExecutableHops(node.continue, out, variableValues);
    }
    return;
  }
  if (node.kind === 'Condition') {
    const taken =
      variableValues?.[node.condition] === true
        ? node.ifClause
        : node.elseClause;
    if (taken) {
      collectExecutableHops(taken, out, variableValues);
    }
    return;
  }
  if (node.kind === 'Sequence' || node.kind === 'Parallel') {
    for (const child of node.nodes) {
      collectExecutableHops(child, out, variableValues);
    }
  }
}

function hopCompletesIds(hop: ExecutableHop): string[] {
  if (hop.completesIds?.length) {
    return hop.completesIds;
  }
  return hop.id ? [hop.id] : [];
}

function hopDependsOn(hop: ExecutableHop): string[] {
  return hop.dependsOn ?? [];
}

function rootResponseKey(
  hop: Extract<StitchPlanNode, { kind: 'Fetch' }>,
): string | null {
  if (!hop.rootField) {
    return null;
  }
  return hop.rootField.alias?.value ?? hop.rootField.name.value;
}

function entityPathKey(
  hop: Extract<StitchPlanNode, { kind: 'Fetch' }>,
): string | null {
  if (!hop.entityTypeName) {
    return null;
  }
  return JSON.stringify(hop.flattenPaths ?? hop.flattenPath ?? null);
}

function selectedEntityFields(
  hop: Extract<StitchPlanNode, { kind: 'Fetch' }>,
): Set<string> {
  const names = new Set<string>();
  for (const sel of hop.selectionSet.selections) {
    if (sel.kind === Kind.FIELD && sel.name.value !== '__typename') {
      names.add(sel.name.value);
    }
  }
  return names;
}

function runOneHop(
  hop: ExecutableHop,
  ctx: BackboneExecutionContext,
): MaybePromise<void> {
  if (hop.kind === 'BatchFetch') {
    return executeBatchFetchNode(hop, ctx);
  }
  if (hop.kind === 'Island') {
    return executeIslandNode(hop, ctx);
  }
  return executeFetchNode(hop, ctx);
}

/** Top-level response keys selected under a root Fetch (skip __typename). */
function rootFetchTopFields(
  fetch: Extract<StitchPlanNode, { kind: 'Fetch' }>,
): string[] {
  const sels = fetch.rootField?.selectionSet?.selections ?? [];
  const names: string[] = [];
  for (const s of sels) {
    if (s.kind === Kind.FIELD && s.name.value !== '__typename') {
      names.push(s.alias?.value ?? s.name.value);
    }
  }
  return names;
}

/**
 * True when a failed sibling's selection still shows as null/missing on the
 * merged object (e.g. downed subgraph left `subgraph2: null`). List roots that
 * another sibling already filled do not count as holes.
 */
function failedFetchExplainsHole(
  fetch: Extract<StitchPlanNode, { kind: 'Fetch' }>,
  merged: any,
): boolean {
  if (merged == null) {
    return true;
  }
  if (Array.isArray(merged)) {
    return false;
  }
  if (typeof merged !== 'object') {
    return false;
  }
  for (const name of rootFetchTopFields(fetch)) {
    if (merged[name] == null) {
      return true;
    }
  }
  return false;
}

/**
 * Shared-root Parallel: isolate per-subgraph errors then deep-merge (provides /
 * union-intersection - one owner errors while another returns data).
 *
 * Lift sibling errors only when they explain a hole in the merged object (or
 * every sibling failed). Drop speculative-subgraph errors when another owner
 * already filled the selection (@provides / union probes).
 */
function runSameKeyRootFetches(
  fetches: Array<Extract<StitchPlanNode, { kind: 'Fetch' }>>,
  ctx: BackboneExecutionContext,
): MaybePromise<void> {
  const responseKey = rootResponseKey(fetches[0]!)!;
  const jobs = fetches.map((child) => {
    const childErrors: any[] = [];
    const childCtx: BackboneExecutionContext = {
      ...ctx,
      data: {},
      errors: childErrors,
    };
    return handleMaybePromise(
      () => executeFetchNode(child, childCtx),
      () => ({
        data: childCtx.data[responseKey],
        errors: childErrors,
      }),
    );
  });
  return handleMaybePromise(
    () => allMaybePromises(jobs),
    (parts: Array<{ data: any; errors: any[] }>) => {
      let merged: any = undefined;
      for (const part of parts) {
        // Errors-only siblings set `data[responseKey] = null`; skip that null
        // so a successful sibling's object is not replaced by root null.
        if (part.data != null) {
          merged = mergeRootValues(merged, part.data);
        }
      }
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (!part.errors.length) {
          continue;
        }
        if (
          merged === undefined ||
          failedFetchExplainsHole(fetches[i]!, merged)
        ) {
          ctx.errors.push(...part.errors);
        }
      }
      if (merged !== undefined) {
        ctx.data[responseKey] = merged;
      } else if (parts.some((part) => part.errors.length)) {
        // Every sibling failed or returned null - expose null for nullability
        // bubbling in finalizeRootResult.
        ctx.data[responseKey] = null;
      }
    },
  );
}

/**
 * Barrier-free dataflow: fire every annotated hop as soon as its `dependsOn`
 * ids are complete. Preserves tree semantics for:
 * - shared-root Parallel merge (provides / abstract roots)
 * - overlapping same-path entity field writes
 * - Condition branch selection
 * - Island -> continue ordering
 */
export function executeDataflowPlan(
  root: StitchPlanNode,
  ctx: BackboneExecutionContext,
): MaybePromise<void> {
  const hops: ExecutableHop[] = [];
  collectExecutableHops(root, hops, ctx.variableValues ?? {});
  if (!hops.length) {
    return;
  }
  // Planner must annotate every hop - no tree-execute fallback.
  if (!hops.every((h) => h.id != null && h.dependsOn != null)) {
    throw new Error(
      'Stitch plan hops missing id/dependsOn; annotateFetchDeps required',
    );
  }

  const done = new Set<string>();
  const pending = new Set(hops);
  let remaining = hops.length;

  const markDone = (hop: ExecutableHop) => {
    for (const id of hopCompletesIds(hop)) {
      done.add(id);
    }
    remaining--;
  };

  const runReady = (): MaybePromise<void> => {
    if (remaining === 0) {
      return;
    }
    const ready: ExecutableHop[] = [];
    for (const hop of pending) {
      if (hopDependsOn(hop).every((d) => done.has(d))) {
        ready.push(hop);
      }
    }
    if (!ready.length) {
      // Missed edge - drain sequentially (still apply root-merge rules).
      let chain: MaybePromise<void> = undefined;
      const left = [...pending];
      for (const hop of left) {
        pending.delete(hop);
        chain = handleMaybePromise(
          () => chain,
          () =>
            handleMaybePromise(
              () => runOneHop(hop, ctx),
              () => {
                markDone(hop);
              },
            ),
        );
      }
      return chain;
    }
    for (const hop of ready) {
      pending.delete(hop);
    }

    // Group same-key root Fetches -> isolated merge (tree Parallel sameKey).
    const rootGroups = new Map<
      string,
      Array<Extract<StitchPlanNode, { kind: 'Fetch' }>>
    >();
    const rest: ExecutableHop[] = [];
    for (const hop of ready) {
      if (hop.kind === 'Fetch') {
        const key = rootResponseKey(hop);
        if (key != null) {
          let list = rootGroups.get(key);
          if (!list) {
            list = [];
            rootGroups.set(key, list);
          }
          list.push(hop);
          continue;
        }
      }
      rest.push(hop);
    }

    const jobs: Array<MaybePromise<void>> = [];

    for (const group of rootGroups.values()) {
      if (group.length > 1) {
        jobs.push(
          handleMaybePromise(
            () => runSameKeyRootFetches(group, ctx),
            () => {
              for (const hop of group) {
                markDone(hop);
              }
            },
          ),
        );
      } else {
        rest.push(group[0]!);
      }
    }

    // Overlapping same-path entity Fetches must serialize (merge race).
    const entityByPath = new Map<
      string,
      Array<Extract<StitchPlanNode, { kind: 'Fetch' }>>
    >();
    const nonEntity: ExecutableHop[] = [];
    for (const hop of rest) {
      if (hop.kind === 'Fetch') {
        const pk = entityPathKey(hop);
        if (pk != null) {
          let list = entityByPath.get(pk);
          if (!list) {
            list = [];
            entityByPath.set(pk, list);
          }
          list.push(hop);
          continue;
        }
      }
      nonEntity.push(hop);
    }

    for (const group of entityByPath.values()) {
      let overlapping = false;
      if (group.length > 1) {
        const fieldSets = group.map(selectedEntityFields);
        outer: for (let i = 0; i < fieldSets.length; i++) {
          for (let j = i + 1; j < fieldSets.length; j++) {
            for (const name of fieldSets[i]!) {
              if (fieldSets[j]!.has(name)) {
                overlapping = true;
                break outer;
              }
            }
          }
        }
      }
      if (overlapping) {
        let chain: MaybePromise<void> = undefined;
        for (const hop of group) {
          chain = handleMaybePromise(
            () => chain,
            () =>
              handleMaybePromise(
                () => executeFetchNode(hop, ctx),
                () => {
                  markDone(hop);
                },
              ),
          );
        }
        jobs.push(chain);
      } else {
        for (const hop of group) {
          nonEntity.push(hop);
        }
      }
    }

    for (const hop of nonEntity) {
      jobs.push(
        handleMaybePromise(
          () => runOneHop(hop, ctx),
          () => {
            markDone(hop);
          },
        ),
      );
    }

    return handleMaybePromise(
      () => awaitMaybePromises(jobs),
      () => runReady(),
    );
  };

  return runReady();
}

function matchEntityParent(
  parent: Record<string, any>,
  entityTypeName: string,
  schema: GraphQLSchema,
): boolean {
  if (parent == null) {
    return false;
  }
  if (parent['__typename'] === entityTypeName) {
    return true;
  }
  const entityType = schema.getType(entityTypeName);
  if (parent['__typename'] == null) {
    return isInterfaceType(entityType);
  }
  if (!isInterfaceType(entityType)) {
    return false;
  }
  const runtime = schema.getType(parent['__typename']);
  return (
    isObjectType(runtime) &&
    runtime.getInterfaces().some((i) => i.name === entityTypeName)
  );
}

function collectAliasParents(
  ctx: BackboneExecutionContext,
  entityTypeName: string,
  flattenPaths: PathSegment[][],
): Array<Record<string, any>> {
  const parents: Array<Record<string, any>> = [];
  const seen = new Set<Record<string, any>>();
  for (const path of flattenPaths) {
    for (const p of collectEntitiesAtPath(ctx.data, path)) {
      if (matchEntityParent(p, entityTypeName, ctx.schema) && !seen.has(p)) {
        seen.add(p);
        parents.push(p);
      }
    }
  }
  return parents;
}

function projectRepresentations(
  parents: Array<Record<string, any>>,
  hopSubschema: Subschema,
  entityTypeName: string,
): {
  keys: any[];
  parentKeyIndex: number[];
  entry: {
    fieldName: string;
    key: (p: any) => any;
    argsFromKeys: (keys: ReadonlyArray<any>) => Record<string, any>;
  };
} | null {
  const entry = getBatchedMergeEntry(hopSubschema, entityTypeName);
  if (!entry) {
    return null;
  }
  const cacheKeyFn = entry.dataLoaderOptions?.cacheKeyFn;
  const keys: any[] = [];
  const identityToIndex = new Map<string, number>();
  const parentKeyIndex: number[] = new Array(parents.length);
  for (let i = 0; i < parents.length; i++) {
    const key = entry.key(parents[i]!);
    if (key == null) {
      parentKeyIndex[i] = -1;
      continue;
    }
    const identity =
      cacheKeyFn != null ? String(cacheKeyFn(key)) : JSON.stringify(key);
    let idx = identityToIndex.get(identity);
    if (idx == null) {
      idx = keys.length;
      identityToIndex.set(identity, idx);
      keys.push(key);
    }
    parentKeyIndex[i] = idx;
  }
  return {
    keys,
    parentKeyIndex,
    entry: {
      fieldName: entry.fieldName,
      key: entry.key,
      argsFromKeys: entry.argsFromKeys,
    },
  };
}

type BatchAliasPrep = {
  alias: string;
  parents: Array<Record<string, any>>;
  parentKeyIndex: number[];
  /** Offset of this alias's keys inside the concatenated `representations` array. */
  keyOffset: number;
  keyCount: number;
};

/**
 * True when selection is only scalar/enum fields (+ __typename) - no nests,
 * fragments, args, or directives. Directives (`@include`/`@skip`) need
 * variable defs that Transformer/finalizeGatewayRequest would attach.
 */
function isLeafOnlySelection(selectionSet: SelectionSetNode): boolean {
  for (const sel of selectionSet.selections) {
    if (sel.kind !== Kind.FIELD) {
      return false;
    }
    if (sel.name.value === '__typename') {
      continue;
    }
    if (sel.selectionSet || sel.arguments?.length || sel.directives?.length) {
      return false;
    }
  }
  return true;
}

/**
 * Multi-type BatchFetch - one prebuilt merge-field document with inline
 * fragments for every alias, one subgraph HTTP round-trip, then slice the
 * result array by key ranges. Nested alias selections fall back to parallel
 * Fetches (gateway `batch` executor still collapses same-tick merge fields).
 */
function executeBatchFetchNode(
  node: Extract<StitchPlanNode, { kind: 'BatchFetch' }>,
  ctx: BackboneExecutionContext,
): MaybePromise<void> {
  if (!node.aliases.length) {
    return;
  }

  // Prefer one concatenated merge-field HTTP whenever the plan attached a
  // document. Alias selectionSets stay unfiltered for the parallel-Fetch
  // fallback; the document itself carries subgraph-filtered selections.
  if (node.document) {
    const prepared: BatchAliasPrep[] = [];
    const allKeys: any[] = [];
    let canRawBatch = true;
    let mergeEntry: ReturnType<typeof getBatchedMergeEntry> = null;

    for (let i = 0; i < node.aliases.length; i++) {
      const a = node.aliases[i]!;
      const parents = collectAliasParents(
        ctx,
        a.entityTypeName,
        a.flattenPaths,
      );
      if (!parents.length) {
        prepared.push({
          alias: a.alias,
          parents: [],
          parentKeyIndex: [],
          keyOffset: allKeys.length,
          keyCount: 0,
        });
        continue;
      }
      const projected = projectRepresentations(
        parents,
        node.subschema,
        a.entityTypeName,
      );
      if (!projected) {
        canRawBatch = false;
        break;
      }
      mergeEntry ??= getBatchedMergeEntry(node.subschema, a.entityTypeName);
      const keyOffset = allKeys.length;
      for (const key of projected.keys) {
        allKeys.push(key);
      }
      prepared.push({
        alias: a.alias,
        parents,
        parentKeyIndex: projected.parentKeyIndex,
        keyOffset,
        keyCount: projected.keys.length,
      });
    }

    if (canRawBatch && mergeEntry) {
      if (!allKeys.length) {
        return;
      }
      const fieldName = mergeEntry.fieldName;
      const variables = mergeEntry.argsFromKeys(allKeys);
      const executor = getSubschemaExecutor(node.subschema);
      return handleMaybePromise(
        () =>
          executor({
            document: node.document!,
            variables,
            context: ctx.contextValue,
            rootValue: ctx.rootValue,
            operationType: OperationTypeNode.QUERY,
            signal: ctx.signal,
            subgraphName: node.subschema.name,
          } satisfies ExecutionRequest) as MaybePromise<ExecutionResult>,
        (result: ExecutionResult) => {
          if (result.errors?.length) {
            ctx.errors.push(...result.errors);
          }
          const entities = result.data?.[fieldName];
          if (!Array.isArray(entities)) {
            return;
          }
          for (const prep of prepared) {
            if (!prep.keyCount) {
              continue;
            }
            for (let i = 0; i < prep.parents.length; i++) {
              const ki = prep.parentKeyIndex[i]!;
              if (ki < 0) {
                continue;
              }
              const entity = entities[prep.keyOffset + ki];
              if (entity instanceof Error) {
                ctx.errors.push(entity);
                continue;
              }
              if (entity == null || typeof entity !== 'object') {
                continue;
              }
              mergeEntityIntoParent(
                prep.parents[i]!,
                entity as Record<string, any>,
                ctx.schema,
                node.subschema,
              );
            }
          }
        },
        (err) => {
          ctx.errors.push(
            errorFromFetchThrow(
              err,
              node.subschema,
              node.aliases[0]?.alias ?? fieldName,
            ),
          );
        },
      );
    }
  }

  // Nested / abstract aliases: parallel Fetch (gateway batch executor merges
  // same-tick merge fields when `batch` is enabled).
  const jobs = node.aliases.map((a) =>
    executeFetchNode(
      {
        kind: 'Fetch',
        subschema: node.subschema,
        entityTypeName: a.entityTypeName,
        selectionSet: a.selectionSet,
        flattenPaths: a.flattenPaths,
        flattenPath: a.flattenPaths[0],
      },
      ctx,
    ),
  );
  return awaitMaybePromises(jobs);
}

export function executeStitchPlan(
  schema: GraphQLSchema,
  plan: StitchPlan,
  request: ExecutionRequest,
): MaybePromise<ExecutionResult> {
  const operation = getOperationASTFromRequest(request) ?? plan.operation;
  const fragments =
    Object.keys(plan.fragments).length > 0
      ? plan.fragments
      : getFragmentsFromDocument(request.document);

  const variableValues = request.variables ?? {};

  const contextValue =
    request.context != null && typeof request.context === 'object'
      ? request.context
      : Object.create(null);
  // Let root proxying resolvers know Island resolvers must use originals.
  (contextValue as any)[BACKBONE_EXECUTING] = true;

  const ctx: BackboneExecutionContext = {
    schema,
    document: request.document,
    operation,
    fragments,
    variableValues,
    contextValue,
    rootValue: request.rootValue,
    signal: request.signal,
    data: {},
    errors: [],
    infoStub: {},
  };

  // Dataflow only - Sequence/Parallel are plan shape; schedule is dependsOn.
  return handleMaybePromise(
    () => executeDataflowPlan(plan.root, ctx),
    () => {
      try {
        return finalizeRootResult(ctx);
      } finally {
        delete (contextValue as any)[BACKBONE_EXECUTING];
        (contextValue as any)[BACKBONE_HYDRATED] = true;
      }
    },
  );
}
