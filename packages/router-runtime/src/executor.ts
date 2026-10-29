import { documentStringMap } from '@envelop/core';
import type {
  BatchFetchNode,
  EntityBatchAlias,
  FetchNode,
  FetchNodePathSegment,
  FetchRewrite,
  FlattenNodePathSegment,
  PlanNode,
  QueryPlan,
  RequiresSelection,
} from '@graphql-hive/router-query-planner';
import { getFragmentsFromDocument } from '@graphql-tools/executor';
import {
  coerceGetVariableValuesResult,
  ExecutionRequest,
  getDirective,
  getOperationASTFromDocument,
  getOperationASTFromRequest,
  MaybeAsyncIterable,
  memoize1,
  mergeDeep,
  relocatedError,
  type ExecutionResult,
} from '@graphql-tools/utils';
import { isPromise, type MaybePromise } from '@whatwg-node/promise-helpers';
import {
  ASTNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  getNamedType,
  getVariableValues,
  GraphQLError,
  GraphQLNamedType,
  GraphQLSchema,
  isAbstractType,
  isEnumType,
  isInterfaceType,
  isNonNullType,
  isObjectType,
  isOutputType,
  Kind,
  OperationDefinitionNode,
  OperationTypeNode,
  parse,
  SelectionSetNode,
  TypeNameMetaFieldDef,
  VariableDefinitionNode,
  visit,
} from 'graphql';
import { handleMaybePromiseMaybeAsyncIterable } from './utils';

export interface QueryPlanExecutionContext {
  /**
   * The public schema of the supergraph
   */
  supergraphSchema: GraphQLSchema;
  /**
   * Operation definition in the document
   */
  operation: OperationDefinitionNode;
  /**
   * The fragment definitions in the document
   */
  fragments: Record<string, FragmentDefinitionNode>;
  /**
   * The coerced variable values
   */
  variableValues?: Record<string, any>;
  /**
   * The final data
   */
  data: Record<string, EntityRepresentation>;
  /**
   * The final set of errors
   */
  errors: GraphQLError[];

  /**
   * Original ExecutionRequest
   */
  executionRequest: ExecutionRequest;

  /**
   * The factory function that returns an executor for a subgraph
   */
  onSubgraphExecute(
    subgraphName: string,
    executionRequest: ExecutionRequest,
  ): MaybePromise<MaybeAsyncIterable<ExecutionResult>>;
}

export interface EntityRepresentation {
  __typename: string;
  [key: string]: any;
}

export function isEntityRepresentation(obj: any): obj is EntityRepresentation {
  return obj?.__typename != null;
}

export interface QueryPlanExecutorOptions {
  /**
   * The AST of the query plan to execute
   */
  queryPlan: QueryPlan;
  /**
   * Execution request
   */
  executionRequest: ExecutionRequest;

  /**
   * The public schema of the supergraph
   */
  supergraphSchema: GraphQLSchema;
  /**
   * The factory function that returns an executor for a subgraph
   */
  onSubgraphExecute(
    subgraphName: string,
    executionRequest: ExecutionRequest,
  ): MaybePromise<MaybeAsyncIterable<ExecutionResult>>;
}

export function executeQueryPlan({
  queryPlan,
  executionRequest,
  onSubgraphExecute,
  supergraphSchema,
}: QueryPlanExecutorOptions): MaybePromise<
  MaybeAsyncIterable<ExecutionResult<any>>
> {
  const node = queryPlan.node;
  if (!node) {
    throw new Error('Query plan has no root node.');
  }
  const executionContext = createQueryPlanExecutionContext({
    supergraphSchema,
    executionRequest,
    onSubgraphExecute,
  });
  return handleMaybePromiseMaybeAsyncIterable(
    () => executePlanNode(node, executionContext),
    () => {
      const executionResult = {} as ExecutionResult;
      if (Object.keys(executionContext.data).length > 0) {
        executionResult.data = projectDataByOperation(executionContext);
      }
      if (executionContext.errors.length > 0) {
        executionResult.errors = executionContext.errors;
      }
      return executionResult;
    },
  );
}

interface CreateExecutionContextOpts {
  /**
   * The public schema of the supergraph
   */
  supergraphSchema: GraphQLSchema;

  /**
   * Execution request
   */
  executionRequest: ExecutionRequest;

  /**
   * The factory function that returns an executor for a subgraph
   */
  onSubgraphExecute(
    subgraphName: string,
    executionRequest: ExecutionRequest,
  ): MaybePromise<MaybeAsyncIterable<ExecutionResult>>;
}

const globalEmpty = {};

function createQueryPlanExecutionContext({
  supergraphSchema,
  executionRequest,
  onSubgraphExecute,
}: CreateExecutionContextOpts): QueryPlanExecutionContext {
  const fragments = getFragmentsFromDocument(executionRequest.document);
  const operation = getOperationASTFromRequest(executionRequest);

  let variableValues = executionRequest.variables;
  if (operation.variableDefinitions) {
    // graphql 16 returns `{ coerced }`; graphql 17 returns `{ variableValues }`.
    const variableValuesResult = coerceGetVariableValuesResult(
      getVariableValues(
        supergraphSchema,
        operation.variableDefinitions,
        variableValues || globalEmpty,
      ),
    );
    if ('errors' in variableValuesResult) {
      if (variableValuesResult.errors.length === 1) {
        throw variableValuesResult.errors[0];
      }
      throw new AggregateError(
        variableValuesResult.errors,
        'Variable parsing error',
      );
    }
    variableValues = variableValuesResult.variableValues.coerced;
  }
  return {
    supergraphSchema,
    operation,
    fragments,
    variableValues,
    data: {},
    errors: [],
    onSubgraphExecute,
    executionRequest,
  };
}

type NormalizedFlattenNodePathSegment =
  | { kind: 'Field'; name: string }
  | { kind: 'Cast'; typeCondition: string[] }
  | { kind: 'List' };

/**
 * The `@fromContext` details the query planner adds to entity fetches and batch aliases.
 */
type FetchContext = Pick<FetchNode, 'contextVariables' | 'contextRewrites'>;

/**
 * Entities whose context variables have the same values. Every group is sent with its own
 * representations and context variables.
 */
interface ContextGroup {
  variables: Record<string, unknown>;
  representations: EntityRepresentation[];
  identityToIndex: Map<string, number>;
}

interface CollectedEntity {
  entity: EntityRepresentation;
  path: (string | number)[];
  /**
   * The index of the entity's representation in the representations of all groups,
   * concatenated in group order.
   */
  index: number;
}

interface CollectedEntities {
  groups: ContextGroup[];
  /** Where the representations of every group start, plus where the last group ends. */
  offsets: number[];
  entities: CollectedEntity[];
  entityPathsByIndex: Map<number, (string | number)[][]>;
}

interface FlattenPreparedContext extends CollectedEntities {
  errorPath?: string[];
}

interface BatchAliasPreparedContext extends CollectedEntities {
  alias: EntityBatchAlias;
}

interface BatchPreparedContext {
  byAlias: Map<string, BatchAliasPreparedContext>;
  /**
   * The waves that have representations. A wave is the n-th context group of every alias,
   * without context variables there is one wave.
   */
  waves: number[];
}

/** The representations a request sends, by their index in {@link CollectedEntity}. */
interface RepresentationRange {
  start: number;
  end: number;
}

interface ExecutionState {
  representations?: EntityRepresentation[];
  errorPath?: (string | number)[];
}

function normalizeFlattenNodePath(
  path: FlattenNodePathSegment[],
): NormalizedFlattenNodePathSegment[] {
  const normalized: NormalizedFlattenNodePathSegment[] = [];
  for (const segment of path) {
    if (segment === '@') {
      normalized.push({ kind: 'List' });
      continue;
    } else if ('Field' in segment) {
      normalized.push({ kind: 'Field', name: segment.Field });
    } else if ('TypeCondition' in segment) {
      normalized.push({ kind: 'Cast', typeCondition: segment.TypeCondition });
    } else {
      throw new Error(
        `Unsupported flatten path segment received from query planner: ${JSON.stringify(segment)}`,
      );
    }
  }
  return normalized;
}

function getContextGroupVariables(context: FetchContext): string[] {
  const names = [...(context.contextVariables ?? [])];
  for (const rewrite of context.contextRewrites ?? []) {
    if (!names.includes(rewrite.renameKeyTo)) {
      names.push(rewrite.renameKeyTo);
    }
  }
  return names;
}

/**
 * Selects the value at `path` in `value`, keeping the shape of lists along the way.
 * Returns `undefined` when the path doesn't apply to the value.
 */
function selectContextValue(
  value: unknown,
  path: FetchNodePathSegment[],
  supergraphSchema: GraphQLSchema,
): unknown {
  if (!path.length || value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(
      (item) => selectContextValue(item, path, supergraphSchema) ?? null,
    );
  }
  if (typeof value !== 'object') {
    return undefined;
  }
  const [segment, ...rest] = path;
  if (segment === 'Parent') {
    return undefined;
  }
  if ('Key' in segment!) {
    if (!Object.hasOwn(value, segment.Key)) {
      return undefined;
    }
    return selectContextValue(
      (value as Record<string, unknown>)[segment.Key],
      rest,
      supergraphSchema,
    );
  }
  const typename = (value as Record<string, unknown>)['__typename'];
  if (
    typeof typename !== 'string' ||
    !entitySatisfiesTypeCondition(
      supergraphSchema,
      typename,
      segment!.TypenameEquals,
    )
  ) {
    return undefined;
  }
  return selectContextValue(value, rest, supergraphSchema);
}

/**
 * Walks every path, collects the entities and deduplicates their representations. The entities
 * are grouped by the values of their context variables, which are read from the entity or its
 * ancestors as the context rewrites describe. Without context variables there is a single group.
 */
function collectEntities(
  data: Record<string, any>,
  paths: FlattenNodePathSegment[][],
  requires: RequiresSelection[],
  inputRewrites: FetchRewrite[] | undefined,
  context: FetchContext,
  supergraphSchema: GraphQLSchema,
): CollectedEntities {
  const names = getContextGroupVariables(context);
  const sources = names.map((name) =>
    (context.contextRewrites ?? [])
      .filter((rewrite) => rewrite.renameKeyTo === name)
      .map((rewrite) => {
        let parentDepth = 0;
        while (rewrite.path[parentDepth] === 'Parent') {
          parentDepth++;
        }
        return { parentDepth, path: rewrite.path.slice(parentDepth) };
      }),
  );
  const depths = [
    ...new Set(sources.flat().map((source) => source.parentDepth)),
  ];
  const groups: ContextGroup[] = [];
  const groupIndexByValues = new Map<string, number>();
  if (!names.length) {
    groups.push({
      variables: {},
      representations: [],
      identityToIndex: new Map(),
    });
  }
  // entities that read their values from the same objects land in the same group
  let lastAncestors: unknown[] | undefined;
  let lastGroupIndex = 0;
  function resolveGroupIndex(entity: object, ancestors: object[]): number {
    if (!names.length) {
      return 0;
    }
    const ancestor = (depth: number) =>
      depth === 0 ? entity : ancestors[ancestors.length - depth];
    const currentAncestors = depths.map(ancestor);
    if (
      lastAncestors &&
      currentAncestors.every((current, i) => current === lastAncestors![i])
    ) {
      return lastGroupIndex;
    }
    lastAncestors = currentAncestors;
    const values = sources.map((candidates) => {
      for (const source of candidates) {
        const from = ancestor(source.parentDepth);
        if (from === undefined) {
          continue;
        }
        const value = selectContextValue(from, source.path, supergraphSchema);
        if (value !== undefined) {
          return value;
        }
      }
      // null like apollo does, the subgraph enforces the argument nullability
      return null;
    });
    const key = stableStringify(values);
    let index = groupIndexByValues.get(key);
    if (index == null) {
      index = groups.length;
      groupIndexByValues.set(key, index);
      groups.push({
        variables: Object.fromEntries(
          names.map((name, i) => [name, values[i]]),
        ),
        representations: [],
        identityToIndex: new Map(),
      });
    }
    lastGroupIndex = index;
    return index;
  }

  const located: {
    entity: EntityRepresentation;
    path: (string | number)[];
    groupIndex: number;
    indexInGroup: number;
  }[] = [];
  function collect(
    entity: unknown,
    path: (string | number)[],
    ancestors: object[],
  ) {
    if (!isEntityRepresentation(entity)) {
      return;
    }
    const groupIndex = resolveGroupIndex(entity, ancestors);
    const group = groups[groupIndex]!;
    let representation = projectRequires(requires, entity, supergraphSchema);
    if (!representation || Array.isArray(representation)) {
      return;
    }
    representation.__typename ??= entity.__typename;
    if (inputRewrites?.length) {
      representation = applyInputRewrites(
        representation,
        inputRewrites,
        supergraphSchema,
      );
    }
    const identity = stableStringify(representation);
    let indexInGroup = group.identityToIndex.get(identity);
    if (indexInGroup == null) {
      indexInGroup = group.representations.length;
      group.identityToIndex.set(identity, indexInGroup);
      group.representations.push(representation);
    }
    located.push({ entity, path, groupIndex, indexInGroup });
  }

  const seenPaths = new Set<string>();
  for (const path of paths) {
    const pathKey = JSON.stringify(path);
    if (seenPaths.has(pathKey)) {
      continue;
    }
    seenPaths.add(pathKey);
    traverseFlattenPath(
      data,
      normalizeFlattenNodePath(path),
      supergraphSchema,
      [],
      [],
      (value, valuePath, ancestors) => {
        if (Array.isArray(value)) {
          for (let index = 0; index < value.length; index++) {
            collect(value[index], [...valuePath, index], ancestors);
          }
        } else {
          collect(value, valuePath.slice(), ancestors);
        }
      },
    );
  }

  const offsets = [0];
  for (const group of groups) {
    offsets.push(offsets[offsets.length - 1]! + group.representations.length);
  }
  const entityPathsByIndex = new Map<number, (string | number)[][]>();
  const entities = located.map(({ entity, path, groupIndex, indexInGroup }) => {
    const index = offsets[groupIndex]! + indexInGroup;
    const paths = entityPathsByIndex.get(index);
    if (paths) {
      paths.push(path);
    } else {
      entityPathsByIndex.set(index, [path]);
    }
    return { entity, path, index };
  });
  return { groups, offsets, entities, entityPathsByIndex };
}

/**
 * Calls `callback` for every value at `remainingPath`, along with its path and the objects
 * holding the fields walked to get there (nearest last).
 */
function traverseFlattenPath(
  current: unknown,
  remainingPath: NormalizedFlattenNodePathSegment[],
  supergraphSchema: GraphQLSchema,
  path: (string | number)[],
  ancestors: object[],
  callback: (
    value: unknown,
    path: (string | number)[],
    ancestors: object[],
  ) => void,
): void {
  if (current == null) {
    return;
  }
  const [segment, ...rest] = remainingPath;
  if (!segment /* same as remainingPath.length === 0 */) {
    callback(current, path, ancestors);
    return;
  }
  switch (segment.kind) {
    case 'Field': {
      if (Array.isArray(current)) {
        for (const item of current) {
          traverseFlattenPath(
            item,
            remainingPath,
            supergraphSchema,
            path,
            ancestors,
            callback,
          );
        }
        return;
      }
      if (typeof current === 'object') {
        path.push(segment.name);
        ancestors.push(current);
        const next = (current as Record<string, any>)[segment.name];
        traverseFlattenPath(
          next,
          rest,
          supergraphSchema,
          path,
          ancestors,
          callback,
        );
        ancestors.pop();
        path.pop();
      }
      return;
    }
    case 'List': {
      if (Array.isArray(current)) {
        for (let index = 0; index < current.length; index++) {
          path.push(index);
          traverseFlattenPath(
            current[index],
            rest,
            supergraphSchema,
            path,
            ancestors,
            callback,
          );
          path.pop();
        }
      }
      return;
    }
    case 'Cast': {
      if (Array.isArray(current)) {
        for (const item of current) {
          traverseFlattenPath(
            item,
            remainingPath,
            supergraphSchema,
            path,
            ancestors,
            callback,
          );
        }
        return;
      }
      if (typeof current === 'object') {
        const value = current as EntityRepresentation;
        const candidateTypenames =
          typeof value.__typename === 'string'
            ? [value.__typename]
            : segment.typeCondition;
        if (
          candidateTypenames.some((typeName) =>
            entitySatisfiesTypeCondition(
              supergraphSchema,
              typeName,
              segment.typeCondition,
            ),
          )
        ) {
          traverseFlattenPath(
            current,
            rest,
            supergraphSchema,
            path,
            ancestors,
            callback,
          );
        }
      }
    }
  }
}

function prepareFlattenContext(
  flattenNode: Extract<PlanNode, { kind: 'Flatten' }>,
  executionContext: QueryPlanExecutionContext,
): FlattenPreparedContext | null {
  if (!flattenNode.node || flattenNode.node.kind !== 'Fetch') {
    return null;
  }
  const fetchNode = flattenNode.node;
  const requires = fetchNode.requires;
  if (!requires || requires.length === 0) {
    return null;
  }

  const collected = collectEntities(
    executionContext.data,
    [flattenNode.path],
    requires,
    fetchNode.inputRewrites,
    fetchNode,
    executionContext.supergraphSchema,
  );
  if (!collected.entities.length) {
    return null;
  }

  const errorPath = normalizeFlattenNodePath(flattenNode.path)
    .filter(
      (
        segment,
      ): segment is Extract<
        NormalizedFlattenNodePathSegment,
        { kind: 'Field' }
      > => segment.kind === 'Field',
    )
    .map((segment) => segment.name);

  return {
    ...collected,
    errorPath: errorPath.length ? errorPath : undefined,
  };
}

function prepareBatchFetchContext(
  batchFetchNode: BatchFetchNode,
  executionContext: QueryPlanExecutionContext,
): BatchPreparedContext | null {
  const byAlias = new Map<string, BatchAliasPreparedContext>();
  // the planner shares a representations variable only between aliases with the same requires,
  // rewrites, context and paths, so they also share the collected entities
  const collectedByVariableName = new Map<string, CollectedEntities>();

  for (const alias of batchFetchNode.entityBatch.aliases) {
    const requires = alias.requires;
    if (!requires || requires.length === 0) {
      continue;
    }
    let collected = collectedByVariableName.get(
      alias.representationsVariableName,
    );
    if (!collected) {
      collected = collectEntities(
        executionContext.data,
        alias.paths,
        requires,
        alias.inputRewrites,
        alias,
        executionContext.supergraphSchema,
      );
      collectedByVariableName.set(alias.representationsVariableName, collected);
    }
    byAlias.set(alias.alias, { ...collected, alias });
  }

  const waveCount = Math.max(
    0,
    ...Array.from(byAlias.values(), (alias) => alias.groups.length),
  );
  const waves: number[] = [];
  for (let wave = 0; wave < waveCount; wave++) {
    for (const alias of byAlias.values()) {
      if (alias.groups[wave]?.representations.length) {
        waves.push(wave);
        break;
      }
    }
  }
  if (!waves.length) {
    return null;
  }

  return { byAlias, waves };
}

function getBatchWaveVariables(
  batchContext: BatchPreparedContext,
  wave: number,
): Record<string, unknown> {
  const variables: Record<string, unknown> = Object.create(null);
  const aliases = Array.from(batchContext.byAlias.values());
  for (const alias of aliases) {
    Object.assign(variables, alias.groups[wave]?.variables);
  }
  // an alias with fewer groups still needs its context variables, it just sends no representations
  for (const alias of aliases) {
    if (alias.groups[wave]) {
      continue;
    }
    for (const name of getContextGroupVariables(alias.alias)) {
      if (!(name in variables)) {
        variables[name] = alias.groups[0]?.variables[name] ?? null;
      }
    }
  }
  for (const alias of aliases) {
    // Always attach the representations variable, even when it resolved to an
    // empty list. The batched `_entities` document declares every alias's
    // `$representations` as a required `[_Any!]!`, so skipping an empty alias
    // sends an operation that declares a variable it never provides — which the
    // subgraph rejects wholesale, failing the sibling aliases that *did* have
    // representations. Sending `[]` keeps the operation valid
    // (`_entities(representations: [])` simply returns `[]`).
    variables[alias.alias.representationsVariableName] ??=
      alias.groups[wave]?.representations ?? [];
  }
  return variables;
}

function applyBatchAliasEntities(
  returnedEntities: EntityRepresentation[],
  aliasContext: BatchAliasPreparedContext,
  range: RepresentationRange,
) {
  for (const { entity: target, index } of aliasContext.entities) {
    if (index < range.start || index >= range.end) {
      continue;
    }
    const entity = returnedEntities[index - range.start];
    if (!target || !entity) {
      continue;
    }
    Object.assign(target, mergeDeep([target, entity], false, true, true));
  }
}

function normalizeBatchFetchErrors(
  errors: readonly GraphQLError[],
  batchContext: BatchPreparedContext,
  ranges: Map<string, RepresentationRange>,
): GraphQLError[] {
  if (!errors.length) {
    return [];
  }

  const relocated: GraphQLError[] = [];
  for (const error of errors) {
    const errorPath = error.path;
    if (!errorPath || errorPath.length === 0) {
      relocated.push(error);
      continue;
    }

    const aliasName = errorPath[0];
    if (typeof aliasName !== 'string') {
      relocated.push(error);
      continue;
    }

    const aliasContext = batchContext.byAlias.get(aliasName);
    const range = ranges.get(aliasName);
    if (!aliasContext || !range) {
      relocated.push(error);
      continue;
    }

    const entityIndex = errorPath[1];
    if (entityIndex === undefined) {
      // the whole aliased _entities field failed, so every entity in it failed
      for (const { path, index } of aliasContext.entities) {
        if (index >= range.start && index < range.end) {
          relocated.push(relocatedError(error, path));
        }
      }
      continue;
    }
    if (typeof entityIndex !== 'number') {
      relocated.push(error);
      continue;
    }

    const index = range.start + entityIndex;
    const mappedPaths =
      index < range.end ? aliasContext.entityPathsByIndex.get(index) : null;
    if (!mappedPaths?.length) {
      relocated.push(error);
      continue;
    }

    const tail = errorPath.slice(2);
    for (const mappedPath of mappedPaths) {
      relocated.push(relocatedError(error, [...mappedPath, ...tail]));
    }
  }

  return relocated;
}

function executeBatchFetchPlanNode(
  batchFetchNode: BatchFetchNode,
  executionContext: QueryPlanExecutionContext,
  batchContext: BatchPreparedContext,
): MaybePromise<any> {
  const selectedVariables = selectFetchVariables(
    executionContext.variableValues,
    batchFetchNode.variableUsages,
  );

  const { byAlias, waves } = batchContext;
  // every wave repeats all batch aliases, each with its own representations and context values
  const aliased =
    waves.length > 1 &&
    batchFetchNode.entityBatch.aliases.some(
      (alias) => alias.contextVariables?.length,
    )
      ? writeContextAliasedDocument(
          getDocumentNodeOfFetchingNode(batchFetchNode),
          batchFetchNode.entityBatch.aliases.flatMap((alias) => [
            ...getContextGroupVariables(alias),
            alias.representationsVariableName,
          ]),
          waves.length,
        )
      : null;

  return waitAll(
    (aliased ? [waves] : waves.map((wave) => [wave])).map((chunk) => {
      const ranges = new Map<string, RepresentationRange>();
      for (const [aliasName, aliasContext] of byAlias) {
        const offsetAt = (wave: number) =>
          aliasContext.offsets[Math.min(wave, aliasContext.groups.length)]!;
        ranges.set(aliasName, {
          start: offsetAt(chunk[0]!),
          end: offsetAt(chunk[chunk.length - 1]! + 1),
        });
      }

      const variablesForFetch: Record<string, any> = selectedVariables
        ? { ...selectedVariables }
        : Object.create(null);
      chunk.forEach((wave, group) => {
        const waveVariables = getBatchWaveVariables(batchContext, wave);
        Object.assign(
          variablesForFetch,
          aliased
            ? renameGroupVariables(
                waveVariables,
                aliased.groupedVariables,
                group,
              )
            : waveVariables,
        );
      });

      return handleMaybePromiseMaybeAsyncIterable(
        () =>
          executeSubgraphRequest(
            batchFetchNode,
            executionContext,
            aliased?.document ?? getDocumentNodeOfFetchingNode(batchFetchNode),
            variablesForFetch,
          ),
        (fetchResult: ExecutionResult) => {
          if (aliased) {
            fetchResult = unaliasContextResult(
              fetchResult,
              aliased.responseKeys,
              aliased.responseKeys.map((key) =>
                chunk.map(
                  (wave) =>
                    byAlias.get(key)?.groups[wave]?.representations.length ?? 0,
                ),
              ),
            );
          }

          if (fetchResult.errors?.length) {
            executionContext.errors.push(
              ...normalizeBatchFetchErrors(
                fetchResult.errors,
                batchContext,
                ranges,
              ),
            );
          }

          const responseData = fetchResult.data;
          if (!responseData || typeof responseData !== 'object') {
            return;
          }

          for (const [aliasName, aliasContext] of byAlias.entries()) {
            let aliasData = (responseData as Record<string, any>)[aliasName];
            if (!aliasData) {
              continue;
            }
            if (aliasContext.alias.outputRewrites?.length) {
              aliasData = applyOutputRewrites(
                aliasData,
                aliasContext.alias.outputRewrites,
                executionContext.supergraphSchema,
              );
            }
            if (Array.isArray(aliasData)) {
              applyBatchAliasEntities(
                aliasData as EntityRepresentation[],
                aliasContext,
                ranges.get(aliasName)!,
              );
            }
          }
          return;
        },
        (error) =>
          handleSubgraphExecutionError(
            error,
            executionContext,
            batchFetchNode.serviceName,
          ),
      );
    }),
  );
}

function executeFlattenFetchPlanNode(
  fetchNode: Extract<PlanNode, { kind: 'Fetch' }>,
  executionContext: QueryPlanExecutionContext,
  flatten: FlattenPreparedContext,
): MaybePromise<any> {
  const document = getDocumentNodeOfFetchingNode(fetchNode);
  const selectedVariables = selectFetchVariables(
    executionContext.variableValues,
    fetchNode.variableUsages,
  );
  const defaultErrorPath = flatten.errorPath ?? getDefaultErrorPath(fetchNode);

  const groups = flatten.groups.flatMap((group, index) =>
    group.representations.length ? [index] : [],
  );
  const contextVariables = fetchNode.contextVariables ?? [];
  // one alias per context group, unless a context variable is non-null. those groups are
  // fetched one by one instead
  const aliased =
    groups.length > 1 &&
    contextVariables.length &&
    !getOperationASTFromDocument(document)?.variableDefinitions?.some(
      (definition) =>
        contextVariables.includes(definition.variable.name.value) &&
        definition.type.kind === Kind.NON_NULL_TYPE,
    )
      ? writeContextAliasedDocument(
          document,
          [...getContextGroupVariables(fetchNode), 'representations'],
          groups.length,
        )
      : null;

  return waitAll(
    (aliased ? [groups] : groups.map((group) => [group])).map((chunk) => {
      const range: RepresentationRange = {
        start: flatten.offsets[chunk[0]!]!,
        end: flatten.offsets[chunk[chunk.length - 1]! + 1]!,
      };
      const variablesForFetch: Record<string, any> = { ...selectedVariables };
      chunk.forEach((groupIndex, group) => {
        const groupVariables = {
          ...flatten.groups[groupIndex]!.variables,
          representations: flatten.groups[groupIndex]!.representations,
        };
        Object.assign(
          variablesForFetch,
          aliased
            ? renameGroupVariables(
                groupVariables,
                aliased.groupedVariables,
                group,
              )
            : groupVariables,
        );
      });

      return handleMaybePromiseMaybeAsyncIterable(
        () =>
          executeSubgraphRequest(
            fetchNode,
            executionContext,
            aliased?.document ?? document,
            variablesForFetch,
          ),
        (fetchResult: ExecutionResult) => {
          if (aliased) {
            const counts = chunk.map(
              (groupIndex) =>
                flatten.groups[groupIndex]!.representations.length,
            );
            fetchResult = unaliasContextResult(
              fetchResult,
              aliased.responseKeys,
              aliased.responseKeys.map(() => counts),
            );
          }

          if (fetchResult.errors?.length) {
            const normalizedErrors = normalizeFetchErrors(fetchResult.errors, {
              fetchNode,
              flatten,
              range,
              defaultPath: defaultErrorPath,
            });
            if (normalizedErrors.length) {
              executionContext.errors.push(...normalizedErrors);
            }
          }

          const responseData = fetchNode.outputRewrites
            ? applyOutputRewrites(
                fetchResult.data,
                fetchNode.outputRewrites,
                executionContext.supergraphSchema,
              )
            : fetchResult.data;

          const returnedEntities = responseData?._entities as
            | EntityRepresentation[]
            | undefined;
          if (Array.isArray(returnedEntities)) {
            mergeFlattenEntities(returnedEntities, flatten, range);
          }
          return;
        },
        (error) =>
          handleSubgraphExecutionError(
            error,
            executionContext,
            fetchNode.serviceName,
            defaultErrorPath,
          ),
      );
    }),
  );
}

function executeSubgraphRequest(
  fetchingNode: Extract<PlanNode, { kind: 'Fetch' } | { kind: 'BatchFetch' }>,
  executionContext: QueryPlanExecutionContext,
  document: DocumentNode,
  variables: Record<string, any> | undefined,
) {
  return executionContext.onSubgraphExecute(fetchingNode.serviceName, {
    document,
    variables,
    operationType:
      (fetchingNode.operationKind as OperationTypeNode | undefined) ??
      executionContext.operation.operation,
    operationName: fetchingNode.operationName,
    extensions: executionContext.executionRequest.extensions,
    rootValue: executionContext.executionRequest.rootValue,
    context: executionContext.executionRequest.context,
    subgraphName: fetchingNode.serviceName,
    info: executionContext.executionRequest.info,
    signal: executionContext.executionRequest.signal,
  });
}

function waitAll(values: MaybePromise<unknown>[]): MaybePromise<unknown> {
  const promises = values.filter(isPromise);
  if (promises.length === 0) {
    return;
  }
  if (promises.length === 1) {
    return promises[0];
  }
  return Promise.all(promises);
}

interface ContextAliasedDocument {
  document: DocumentNode;
  /** The original response key of every top-level field. */
  responseKeys: string[];
  /** The variables every group gets its own copy of. */
  groupedVariables: Set<string>;
}

/**
 * Writes the operation out for `groups` groups of contextual argument values, so that all
 * groups go in one request. Every group gets its own copy of the top-level fields, the
 * fragments and the `groupVariables`, with `_{group}` appended to their names.
 *
 * For two groups, `query($representations:[_Any!]! $c:ID){_entities(representations:$representations){...on T{f(a:$c)}}}`
 * becomes `query($representations_0:[_Any!]! $c_0:ID $representations_1:[_Any!]! $c_1:ID){_entities_0:_entities(representations:$representations_0){...on T{f(a:$c_0)}} _entities_1:_entities(representations:$representations_1){...on T{f(a:$c_1)}}}`.
 *
 * Returns `null` when the operation cannot be written out per group.
 */
function writeContextAliasedDocument(
  document: DocumentNode,
  groupVariables: string[],
  groups: number,
): ContextAliasedDocument | null {
  let operation: OperationDefinitionNode | undefined;
  const fragments: FragmentDefinitionNode[] = [];
  for (const definition of document.definitions) {
    if (
      definition.kind === Kind.OPERATION_DEFINITION &&
      definition.operation === OperationTypeNode.QUERY &&
      !operation
    ) {
      operation = definition;
    } else if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.push(definition);
    } else {
      return null;
    }
  }
  // they'd apply to all groups at once, the planner never adds any
  if (!operation || operation.directives?.length) {
    return null;
  }

  const groupedVariables = new Set<string>();
  const sharedDefinitions: VariableDefinitionNode[] = [];
  const groupedDefinitions: VariableDefinitionNode[] = [];
  for (const definition of operation.variableDefinitions ?? []) {
    const name = definition.variable.name.value;
    if (groupVariables.includes(name)) {
      groupedVariables.add(name);
      groupedDefinitions.push(definition);
    } else {
      sharedDefinitions.push(definition);
    }
  }
  if (!groupedDefinitions.length) {
    return null;
  }
  // a shared `$c_1` next to a per-group `$c` would clash with the copy for group 1
  if (
    sharedDefinitions.some((definition) => {
      const split = splitGroup(definition.variable.name.value);
      return split && groupedVariables.has(split[0]);
    })
  ) {
    return null;
  }

  const fields: FieldNode[] = [];
  for (const selection of operation.selectionSet.selections) {
    if (selection.kind !== Kind.FIELD) {
      return null;
    }
    fields.push(selection);
  }
  const responseKeys = fields.map(
    (field) => field.alias?.value ?? field.name.value,
  );
  const fragmentNames = new Set(
    fragments.map((fragment) => fragment.name.value),
  );

  const variableDefinitions = [...sharedDefinitions];
  const selections: FieldNode[] = [];
  const groupFragments: FragmentDefinitionNode[] = [];
  for (let group = 0; group < groups; group++) {
    const suffix = (name: string) => `${name}_${group}`;
    const rename = <T extends ASTNode>(node: T): T =>
      visit(node, {
        Variable: (variable) =>
          groupedVariables.has(variable.name.value)
            ? {
                ...variable,
                name: { ...variable.name, value: suffix(variable.name.value) },
              }
            : undefined,
        FragmentSpread: (spread) =>
          fragmentNames.has(spread.name.value)
            ? {
                ...spread,
                name: { ...spread.name, value: suffix(spread.name.value) },
              }
            : undefined,
      });
    variableDefinitions.push(...groupedDefinitions.map(rename));
    fields.forEach((field, i) => {
      selections.push(
        rename({
          ...field,
          alias: { kind: Kind.NAME, value: suffix(responseKeys[i]!) },
        }),
      );
    });
    groupFragments.push(
      ...fragments.map((fragment) =>
        rename({
          ...fragment,
          name: { ...fragment.name, value: suffix(fragment.name.value) },
        }),
      ),
    );
  }

  return {
    document: {
      ...document,
      definitions: [
        {
          ...operation,
          variableDefinitions,
          selectionSet: { ...operation.selectionSet, selections },
        },
        ...groupFragments,
      ],
    },
    responseKeys,
    groupedVariables,
  };
}

/** Splits a name like `c_12` into `c` and `12`. */
function splitGroup(name: string): [string, number] | null {
  const match = /^(.+)_(\d+)$/.exec(name);
  return match ? [match[1]!, Number(match[2])] : null;
}

function renameGroupVariables(
  variables: Record<string, unknown>,
  groupedVariables: Set<string>,
  group: number,
): Record<string, unknown> {
  const renamed: Record<string, unknown> = Object.create(null);
  for (const [name, value] of Object.entries(variables)) {
    renamed[groupedVariables.has(name) ? `${name}_${group}` : name] = value;
  }
  return renamed;
}

/**
 * Turns the result of a request written by {@link writeContextAliasedDocument} back into the
 * result of the original operation. The entities of every group are concatenated under the
 * original response key, and error paths are pointed to them.
 *
 * `counts[key][group]` is the number of representations sent for the `key`-th response key in
 * `group`. The entities of a group are padded or cut to that, so the indexes of the following
 * groups stay stable.
 */
function unaliasContextResult(
  result: ExecutionResult,
  responseKeys: string[],
  counts: number[][],
): ExecutionResult {
  const groups = counts[0]?.length ?? 0;
  // where every group starts, plus where the last one ends
  const offsets = counts.map((keyCounts) => {
    const keyOffsets = [0];
    for (const count of keyCounts) {
      keyOffsets.push(keyOffsets[keyOffsets.length - 1]! + count);
    }
    return keyOffsets;
  });
  const parseResponseKey = (alias: unknown) => {
    const split = typeof alias === 'string' ? splitGroup(alias) : null;
    const key = split ? responseKeys.indexOf(split[0]) : -1;
    return split && key !== -1 && split[1] < groups
      ? { key, group: split[1] }
      : null;
  };

  let data = result.data;
  if (data && typeof data === 'object') {
    // every group has its own range in the merged list, so the aliases can come back in any
    // order. a missing group or entity stays null, extra entities are dropped
    const merged = offsets.map((keyOffsets) =>
      new Array(keyOffsets[groups]).fill(null),
    );
    for (const [alias, value] of Object.entries(data)) {
      const parsed = parseResponseKey(alias);
      if (!parsed || !Array.isArray(value)) {
        continue;
      }
      const start = offsets[parsed.key]![parsed.group]!;
      const end = offsets[parsed.key]![parsed.group + 1]!;
      for (let i = 0; i < value.length && start + i < end; i++) {
        merged[parsed.key]![start + i] = value[i];
      }
    }
    data = Object.fromEntries(
      responseKeys.map((key, index) => [key, merged[index]]),
    );
  }

  const errors = result.errors?.flatMap((error) => {
    const parsed = parseResponseKey(error.path?.[0]);
    if (!parsed) {
      return [error];
    }
    const key = responseKeys[parsed.key]!;
    const start = offsets[parsed.key]![parsed.group]!;
    const end = offsets[parsed.key]![parsed.group + 1]!;
    const index = error.path![1];
    if (index === undefined) {
      // the whole aliased field failed, so did every entity of its group, but not the others
      if (start === end) {
        return [relocatedError(error, undefined)];
      }
      return Array.from({ length: end - start }, (_, i) =>
        relocatedError(error, [key, start + i]),
      );
    }
    if (typeof index !== 'number') {
      return [relocatedError(error, [key, ...error.path!.slice(1)])];
    }
    if (start + index >= end) {
      // an entity that wasn't asked for, there's nothing to point to
      return [relocatedError(error, undefined)];
    }
    return [
      relocatedError(error, [key, start + index, ...error.path!.slice(2)]),
    ];
  });

  return { ...result, data, errors };
}

function executeFetchPlanNode(
  fetchNode: Extract<PlanNode, { kind: 'Fetch' }>,
  executionContext: QueryPlanExecutionContext,
  state?: ExecutionState,
): MaybePromise<any> {
  let representationTargets = state?.representations;
  let preparedRepresentations: EntityRepresentation[] | undefined;

  if (representationTargets?.length) {
    const requires = fetchNode.requires;
    if (requires && representationTargets.length) {
      representationTargets = representationTargets.filter((entity) =>
        requires.some(
          (requiresNode) =>
            entity &&
            entitySatisfiesTypeCondition(
              executionContext.supergraphSchema,
              entity.__typename,
              requiresNode.kind === 'InlineFragment'
                ? requiresNode.typeCondition
                : undefined,
            ),
        ),
      );
    }

    if (!representationTargets || representationTargets.length === 0) {
      return;
    }

    const nextTargets: EntityRepresentation[] = [];
    const payloads: EntityRepresentation[] = [];
    for (const entity of representationTargets) {
      let projection = fetchNode.requires
        ? projectRequires(
            fetchNode.requires,
            entity,
            executionContext.supergraphSchema,
          )
        : entity;
      if (!projection || Array.isArray(projection)) {
        continue;
      }
      projection.__typename ??= entity.__typename;
      if (fetchNode.inputRewrites?.length) {
        projection = applyInputRewrites(
          projection,
          fetchNode.inputRewrites,
          executionContext.supergraphSchema,
        );
      }
      payloads.push(projection);
      nextTargets.push(entity);
    }

    if (!payloads.length) {
      return;
    }

    representationTargets = nextTargets;
    preparedRepresentations = payloads;
  }

  const selectedVariables = selectFetchVariables(
    executionContext.variableValues,
    fetchNode.variableUsages,
  );

  let variablesForFetch: Record<string, any> | undefined;
  if (preparedRepresentations?.length) {
    variablesForFetch = {
      representations: preparedRepresentations,
    };
  }
  if (selectedVariables) {
    variablesForFetch = variablesForFetch
      ? { ...selectedVariables, ...variablesForFetch }
      : { ...selectedVariables };
  }

  const defaultErrorPath = state?.errorPath ?? getDefaultErrorPath(fetchNode);

  return handleMaybePromiseMaybeAsyncIterable(
    () =>
      executeSubgraphRequest(
        fetchNode,
        executionContext,
        getDocumentNodeOfFetchingNode(fetchNode),
        variablesForFetch,
      ),
    (fetchResult: ExecutionResult) => {
      if (fetchResult.errors?.length) {
        const normalizedErrors = normalizeFetchErrors(fetchResult.errors, {
          fetchNode,
          defaultPath: defaultErrorPath,
        });
        if (normalizedErrors.length) {
          executionContext.errors.push(...normalizedErrors);
        }
      }

      const responseData = fetchNode.outputRewrites
        ? applyOutputRewrites(
            fetchResult.data,
            fetchNode.outputRewrites,
            executionContext.supergraphSchema,
          )
        : fetchResult.data;

      if (!responseData) {
        return;
      }

      // merge into the selected targets so context-filtered entities keep their matching results.
      if (representationTargets?.length && responseData._entities) {
        const returnedEntities: EntityRepresentation[] = responseData._entities;
        for (let index = 0; index < returnedEntities.length; index++) {
          const entity = returnedEntities[index];
          const target = representationTargets[index];
          if (target && entity) {
            Object.assign(
              target,
              mergeDeep([target, entity], false, true, true),
            );
          }
        }
        return;
      }

      // Subscription root payloads should represent a single event snapshot.
      if (executionContext.operation.operation === 'subscription') {
        executionContext.data = responseData;
      } else {
        Object.assign(
          executionContext.data,
          mergeDeep([executionContext.data, responseData], false, true, true),
        );
      }
      return;
    },
    (error) =>
      handleSubgraphExecutionError(
        error,
        executionContext,
        fetchNode.serviceName,
        defaultErrorPath,
      ),
  );
}

function handleSubgraphExecutionError(
  error: Error,
  executionContext: QueryPlanExecutionContext,
  serviceName: string,
  path?: (string | number)[],
) {
  let graphQLError: GraphQLError;
  if (error instanceof GraphQLError) {
    graphQLError = error;
  } else {
    graphQLError = new GraphQLError(error.message, {
      originalError: error,
      extensions: {
        code: 'DOWNSTREAM_SERVICE_ERROR',
        serviceName,
      },
      path,
    });
  }
  executionContext.errors.push(graphQLError);
}

function selectFetchVariables(
  variableValues: Record<string, any> | undefined,
  variableUsages: string[] | undefined,
): Record<string, any> | undefined {
  if (!variableValues || !variableUsages || variableUsages.length === 0) {
    return undefined;
  }
  const selected: Record<string, any> = Object.create(null);
  let hasValue = false;
  for (const variableName of variableUsages) {
    if (Object.prototype.hasOwnProperty.call(variableValues, variableName)) {
      selected[variableName] = variableValues[variableName];
      hasValue = true;
    }
  }
  return hasValue ? selected : undefined;
}

function normalizeFetchErrors(
  errors: readonly GraphQLError[],
  options: {
    fetchNode: Extract<PlanNode, { kind: 'Fetch' }>;
    flatten?: FlattenPreparedContext;
    /** The representations the failed request sent */
    range?: RepresentationRange;
    defaultPath?: (string | number)[];
  },
): GraphQLError[] {
  if (!errors.length) {
    return [];
  }
  const { fetchNode, flatten } = options;
  const fallbackPath = options.defaultPath ?? getDefaultErrorPath(fetchNode);

  if (!flatten) {
    return errors.map((error) =>
      error.path || !fallbackPath ? error : relocatedError(error, fallbackPath),
    );
  }

  const { start, end } = options.range ?? { start: 0, end: Infinity };
  const relocated: GraphQLError[] = [];

  for (const error of errors) {
    const errorPath = error.path;
    if (errorPath) {
      const entityIndexPosition = errorPath.indexOf('_entities');
      if (
        entityIndexPosition !== -1 &&
        entityIndexPosition === errorPath.length - 1
      ) {
        // the whole _entities field failed, so every entity in the fetch failed
        for (const { path, index } of flatten.entities) {
          if (index >= start && index < end) {
            relocated.push(relocatedError(error, path));
          }
        }
        continue;
      }
      if (entityIndexPosition !== -1) {
        const dedupIndex = errorPath[entityIndexPosition + 1];
        if (typeof dedupIndex === 'number' && start + dedupIndex < end) {
          const mappedPaths = flatten.entityPathsByIndex.get(
            start + dedupIndex,
          );
          if (mappedPaths && mappedPaths.length) {
            const tail = errorPath.slice(entityIndexPosition + 2);
            for (const mappedPath of mappedPaths) {
              relocated.push(relocatedError(error, [...mappedPath, ...tail]));
            }
            continue;
          }
        }
      }
    }

    if (fallbackPath) {
      relocated.push(relocatedError(error, fallbackPath));
    } else {
      relocated.push(error);
    }
  }

  return relocated;
}

function mergeFlattenEntities(
  returnedEntities: EntityRepresentation[],
  flatten: FlattenPreparedContext,
  range: RepresentationRange,
) {
  for (const { entity: target, index } of flatten.entities) {
    if (index < range.start || index >= range.end) {
      continue;
    }
    const entity = returnedEntities[index - range.start];
    if (!target || !entity) {
      continue;
    }
    Object.assign(target, mergeDeep([target, entity], false, true, true));
  }
}

function applyInputRewrites(
  representation: EntityRepresentation,
  rewrites: FetchRewrite[],
  supergraphSchema: GraphQLSchema,
): EntityRepresentation {
  let current: any = representation;
  for (const rewrite of rewrites) {
    const normalizedRewrite = normalizeRewrite(rewrite);
    if (!normalizedRewrite) {
      continue;
    }
    switch (normalizedRewrite.kind) {
      case 'ValueSetter':
        current = applyValueSetter(
          current,
          normalizedRewrite.path,
          normalizedRewrite.setValueTo,
          supergraphSchema,
        );
        break;
      case 'KeyRenamer':
        applyKeyRenamer(
          current,
          normalizedRewrite.path,
          normalizedRewrite.renameKeyTo,
          supergraphSchema,
        );
        break;
    }
  }
  return current as EntityRepresentation;
}

function applyOutputRewrites(
  data: any,
  rewrites: FetchRewrite[],
  supergraphSchema: GraphQLSchema,
) {
  let current = data;
  if (!current) {
    return current;
  }
  for (const rewrite of rewrites) {
    const normalizedRewrite = normalizeRewrite(rewrite);
    if (!normalizedRewrite) {
      continue;
    }
    switch (normalizedRewrite.kind) {
      case 'KeyRenamer':
        applyKeyRenamer(
          current,
          normalizedRewrite.path,
          normalizedRewrite.renameKeyTo,
          supergraphSchema,
        );
        break;
      case 'ValueSetter':
        current = applyValueSetter(
          current,
          normalizedRewrite.path,
          normalizedRewrite.setValueTo,
          supergraphSchema,
        );
        break;
    }
  }
  return current;
}

const getDocumentNodeOfFetchingNode = memoize1(
  function getDocumentNodeOfFetchNode(
    fetchingNode: Extract<PlanNode, { kind: 'Fetch' } | { kind: 'BatchFetch' }>,
  ): DocumentNode {
    const doc = parse(fetchingNode.operation, { noLocation: true });
    // Set this so that `getDocumentString` picks it up from cache
    documentStringMap.set(doc, fetchingNode.operation);
    return doc;
  },
);

const getDefaultErrorPath = memoize1(function getDefaultErrorPath(
  fetchNode: Extract<PlanNode, { kind: 'Fetch' }>,
): (string | number)[] {
  const document = getDocumentNodeOfFetchingNode(fetchNode);
  const operationAst = getOperationASTFromDocument(
    document,
    fetchNode.operationName,
  );
  if (!operationAst) {
    return [];
  }
  const rootSelection = operationAst.selectionSet.selections.find(
    (selection) => selection.kind === Kind.FIELD,
  );
  if (!rootSelection) {
    return [];
  }
  const responseKey = rootSelection.alias?.value ?? rootSelection.name.value;
  return responseKey ? [responseKey] : [];
});

function stableStringify(value: unknown): string {
  if (value == null) {
    return 'null';
  }
  if (value === true) {
    return 'true';
  }
  if (value === false) {
    return 'false';
  }
  const type = typeof value;
  if (type === 'number') {
    return value.toString();
  }
  if (type === 'bigint') {
    return value.toString();
  }
  if (type === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (type === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(
        ([key, entryValue]) =>
          `${stableStringify(key)}:${stableStringify(entryValue)}`,
      );
    return `{${entries.join(',')}}`;
  }
  return 'null';
}

/**
 * Executes the individual plan node
 */
function executePlanNode(
  planNode: PlanNode,
  executionContext: QueryPlanExecutionContext,
  state?: ExecutionState,
): MaybePromise<any> {
  switch (planNode.kind) {
    case 'Sequence': {
      let pending: MaybePromise<unknown> | null = null;
      let nextState: ExecutionState | undefined = state;
      for (const node of planNode.nodes) {
        const currentState = nextState;
        nextState = undefined;
        pending = handleMaybePromiseMaybeAsyncIterable(
          () => pending,
          () => executePlanNode(node, executionContext, currentState),
        );
      }
      return pending;
    }
    case 'Parallel': {
      const promises: PromiseLike<unknown>[] = [];
      planNode.nodes.forEach((node, index) => {
        const maybePromise = executePlanNode(
          node,
          executionContext,
          index === 0 ? state : undefined,
        );
        if (isPromise(maybePromise)) {
          promises.push(maybePromise);
        }
      });
      if (promises.length === 1) {
        return promises[0];
      }
      if (promises.length === 0) {
        return;
      }
      return Promise.all(promises);
    }
    case 'Flatten': {
      const flattenContext = prepareFlattenContext(planNode, executionContext);
      if (!flattenContext) {
        return;
      }
      return executeFlattenFetchPlanNode(
        // prepared flatten contexts always have a fetch node
        planNode.node as Extract<PlanNode, { kind: 'Fetch' }>,
        executionContext,
        flattenContext,
      );
    }
    case 'Fetch': {
      return executeFetchPlanNode(planNode, executionContext, state);
    }
    case 'BatchFetch': {
      const batchContext = prepareBatchFetchContext(planNode, executionContext);
      if (!batchContext) {
        return;
      }
      return executeBatchFetchPlanNode(
        planNode,
        executionContext,
        batchContext,
      );
    }
    case 'Condition': {
      const conditionValue =
        executionContext.variableValues?.[planNode.condition];
      if (conditionValue === true) {
        if (planNode.ifClause) {
          return executePlanNode(planNode.ifClause, executionContext);
        }
      } else if (planNode.elseClause) {
        return executePlanNode(planNode.elseClause, executionContext);
      }
      break;
    }
    case 'Subscription': {
      return executeFetchPlanNode(planNode.primary, executionContext);
    }
    default:
      throw new Error(`Invalid plan node: ${JSON.stringify(planNode)}`);
  }
}

type NormalizedRewrite =
  | { kind: 'ValueSetter'; path: string[]; setValueTo: string }
  | { kind: 'KeyRenamer'; path: string[]; renameKeyTo: string };

function normalizeRewrite(rewrite: FetchRewrite): NormalizedRewrite | null {
  if ('kind' in rewrite && rewrite.kind === 'ValueSetter') {
    // TODO: why sometimes rewrite.kind = 'ValueSetter'?
    const path = normalizeRewritePath(rewrite.path);
    return path && { ...rewrite, path };
  }
  if ('ValueSetter' in rewrite) {
    const path = normalizeRewritePath(rewrite.ValueSetter?.path);
    return (
      path && {
        kind: 'ValueSetter',
        path,
        setValueTo: rewrite.ValueSetter?.setValueTo,
      }
    );
  }
  if ('KeyRenamer' in rewrite) {
    const path = normalizeRewritePath(rewrite.KeyRenamer?.path);
    return (
      path && {
        kind: 'KeyRenamer',
        path,
        renameKeyTo: rewrite.KeyRenamer?.renameKeyTo,
      }
    );
  }
  throw new Error(`Unsupported fetch node rewrite: ${JSON.stringify(rewrite)}`);
}

/**
 * Returns `null` for paths through a parent, those only make sense for context rewrites
 * and leave the data as is.
 */
function normalizeRewritePath(path: FetchNodePathSegment[]): string[] | null {
  const normalized: string[] = [];
  for (const segment of path) {
    if (segment === 'Parent') {
      return null;
    }
    if ('TypenameEquals' in segment) {
      normalized.push(`... on ${segment.TypenameEquals}`);
    } else if ('Key' in segment) {
      normalized.push(segment.Key);
    } else {
      throw new Error(
        `Unsupported fetch node path segment: ${JSON.stringify(segment)}`,
      );
    }
  }
  return normalized;
}

function applyKeyRenamer(
  entityRepresentation: EntityRepresentation,
  path: string[],
  renameKeyTo: string,
  supergraphSchema: GraphQLSchema,
): unknown {
  const keyProp = path[0];
  if (!keyProp) {
    throw new Error('Invalid key prop');
  }
  const nextPath = path.slice(1);
  if (keyProp.startsWith('... on')) {
    const typeCondition = keyProp.split('... on ')[1];
    if (
      isEntityRepresentation(entityRepresentation) &&
      typeCondition &&
      !entitySatisfiesTypeCondition(
        supergraphSchema,
        entityRepresentation.__typename,
        typeCondition,
      )
    ) {
      return;
    }
    return applyKeyRenamer(
      entityRepresentation,
      nextPath,
      renameKeyTo,
      supergraphSchema,
    );
  }
  if (path.length === 1) {
    entityRepresentation[renameKeyTo] = entityRepresentation[keyProp];
    delete entityRepresentation[keyProp];
    return;
  }
  const nextData = entityRepresentation[keyProp];
  if (nextData == null) {
    return;
  }
  if (Array.isArray(nextData)) {
    return nextData.map((item) =>
      applyKeyRenamer(item, nextPath, renameKeyTo, supergraphSchema),
    );
  }
  return applyKeyRenamer(nextData, nextPath, renameKeyTo, supergraphSchema);
}

function applyValueSetter(
  data: any,
  path: string[],
  setValueTo: string,
  supergraphSchema: GraphQLSchema,
): any {
  if (Array.isArray(data)) {
    return data.map((item) =>
      applyValueSetter(item, path, setValueTo, supergraphSchema),
    );
  }
  const keyProp = path[0];
  if (!keyProp) {
    return setValueTo;
  }
  const nextPath = path.slice(1);
  if (keyProp.startsWith('... on')) {
    const typeCondition = keyProp.split('... on ')[1];
    if (!typeCondition) {
      throw new Error('Invalid type condition');
    }
    if (
      isEntityRepresentation(data) &&
      !entitySatisfiesTypeCondition(
        supergraphSchema,
        data.__typename,
        typeCondition,
      )
    ) {
      return data;
    }
    return applyValueSetter(data, nextPath, setValueTo, supergraphSchema);
  }
  if (path.length === 1) {
    const existingValue = data[keyProp];
    if (existingValue === setValueTo) {
      return data;
    }
    return {
      ...data,
      [keyProp]: setValueTo,
    };
  }
  const nextData = data[keyProp];
  if (nextData == null) {
    return data;
  }
  return {
    ...data,
    [keyProp]: applyValueSetter(
      nextData,
      nextPath,
      setValueTo,
      supergraphSchema,
    ),
  };
}

/**
 * This function checks if an entity satisfies the inline fragment type condition.
 *
 * @param supergraphSchema GraphQL Schema instance of Supergraph
 * @param typeNameInEntity The type name of the entity (entity.__typename)
 * @param typeConditionInInlineFragment The type condition in the inline fragment (... on Type). If undefined, will return false at all times;
 */
function entitySatisfiesTypeCondition(
  supergraphSchema: GraphQLSchema,
  typeNameInEntity: string,
  typeConditionInInlineFragment: string | readonly string[] | undefined,
) {
  if (!typeConditionInInlineFragment) {
    return false; // unknown actually
  }

  const normalizedTypeConditions = Array.isArray(typeConditionInInlineFragment)
    ? typeConditionInInlineFragment
    : [typeConditionInInlineFragment];

  if (normalizedTypeConditions.includes(typeNameInEntity)) {
    return true;
  }

  const entityType = supergraphSchema.getType(typeNameInEntity);
  if (!isObjectType(entityType)) {
    return false;
  }

  for (const typeCondition of normalizedTypeConditions) {
    const conditionType = supergraphSchema.getType(typeCondition);
    if (
      isAbstractType(conditionType) &&
      supergraphSchema.isSubType(conditionType, entityType)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Helper function for `projectDocumentNode` to iterate over the data with selections
 */
function projectSelectionSet(
  data: any,
  selectionSet: SelectionSetNode,
  type: GraphQLNamedType,
  executionContext: QueryPlanExecutionContext,
  path: (string | number)[],
): any {
  if (data == null) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item, index) => {
      path.push(index);
      const projected = projectSelectionSet(
        item,
        selectionSet,
        type,
        executionContext,
        path,
      );
      path.pop();
      return projected;
    });
  }
  const parentType = isEntityRepresentation(data)
    ? executionContext.supergraphSchema.getType(data.__typename)
    : type;
  if (!isObjectType(parentType) && !isInterfaceType(parentType)) {
    return null;
  }
  // Check if the type itself is marked with @inaccessible
  if (isObjectType(parentType)) {
    const inaccessibleDirective = parentType.astNode?.directives?.find(
      (directive) => directive.name.value === 'inaccessible',
    );
    if (inaccessibleDirective) {
      return null;
    }
  }
  // null proto because response keys come from client-controlled aliases, `__proto__` would
  // otherwise hit Object.prototype on read and merge attacker data into it
  const result: Record<string, any> = Object.create(null);
  selectionLoop: for (const selection of selectionSet.selections) {
    if (selection.directives?.length) {
      for (const directiveNode of selection.directives) {
        const ifArg = directiveNode.arguments?.find(
          (arg) => arg.name.value === 'if',
        );
        if (directiveNode.name.value === 'skip') {
          if (ifArg) {
            const ifValueNode = ifArg.value;
            if (ifValueNode.kind === Kind.VARIABLE) {
              const variableName = ifValueNode.name.value;
              if (executionContext.variableValues?.[variableName]) {
                continue selectionLoop;
              }
            } else if (ifValueNode.kind === Kind.BOOLEAN) {
              if (ifValueNode.value) {
                continue selectionLoop;
              }
            }
          } else {
            continue selectionLoop;
          }
        }
        if (directiveNode.name.value === 'include') {
          if (ifArg) {
            const ifValueNode = ifArg.value;
            if (ifValueNode.kind === Kind.VARIABLE) {
              const variableName = ifValueNode.name.value;
              if (!executionContext.variableValues?.[variableName]) {
                continue selectionLoop;
              }
            } else if (ifValueNode.kind === Kind.BOOLEAN) {
              if (!ifValueNode.value) {
                continue selectionLoop;
              }
            }
          } else {
            continue selectionLoop;
          }
        }
      }
    }
    if (selection.kind === 'Field') {
      const field =
        selection.name.value === '__typename'
          ? TypeNameMetaFieldDef
          : parentType.getFields()[selection.name.value];
      if (!field) {
        throw new Error(
          `Field not found: ${selection.name.value} on ${parentType.name}`,
        );
      }
      const fieldType = getNamedType(field.type);
      const responseKey = selection.alias?.value || selection.name.value;
      let projectedValue = data[responseKey];
      if (selection.selectionSet) {
        path.push(responseKey);
        projectedValue = projectSelectionSet(
          projectedValue,
          selection.selectionSet,
          fieldType,
          executionContext,
          path,
        );
        path.pop();
      }
      if (projectedValue !== undefined) {
        if (isEnumType(fieldType)) {
          const enumType = fieldType;
          function projectEnumValue(value: any): any {
            if (Array.isArray(value)) {
              return value.map((item) => projectEnumValue(item));
            }
            const enumValue = enumType.getValue(value);
            if (enumValue == null) {
              return null;
            } else if (
              getDirective(
                executionContext.supergraphSchema,
                enumValue,
                'inaccessible',
              )?.length
            ) {
              return null;
            }
            return value;
          }
          projectedValue = projectEnumValue(projectedValue);
        }
        if (result[responseKey] == null) {
          result[responseKey] = projectedValue;
        } else if (
          typeof result[responseKey] === 'object' &&
          projectedValue != null
        ) {
          result[responseKey] = Object.assign(
            result[responseKey],
            mergeDeep([result[responseKey], projectedValue]),
          );
        } else {
          result[responseKey] = projectedValue;
        }
      } else if (field.name === '__typename') {
        result[responseKey] = type.name;
      } else if (isNonNullType(field.type)) {
        const fieldPath = [...path, responseKey];
        // an upstream error (like a failed entity lookup) already explains the missing value
        const explained = executionContext.errors.some(
          (error) =>
            error.path &&
            error.path.length <= fieldPath.length &&
            error.path.every((segment, i) => segment === fieldPath[i]),
        );
        if (!explained) {
          executionContext.errors.push(
            new GraphQLError(
              `Cannot return null for non-nullable field ${parentType.name}.${field.name}.`,
              { path: fieldPath },
            ),
          );
        }
        return null;
      } else {
        result[responseKey] = null;
      }
    } else if (selection.kind === 'InlineFragment') {
      const typeCondition = selection.typeCondition?.name.value;
      // If data has a __typename, check if it matches the type condition
      if (isEntityRepresentation(data)) {
        if (
          typeCondition &&
          !entitySatisfiesTypeCondition(
            executionContext.supergraphSchema,
            data.__typename,
            typeCondition,
          )
        ) {
          continue;
        }
        const typeByTypename = executionContext.supergraphSchema.getType(
          data.__typename,
        );
        if (!isOutputType(typeByTypename)) {
          throw new Error('Invalid type');
        }
        const projectedValue = projectSelectionSet(
          data,
          selection.selectionSet,
          typeByTypename,
          executionContext,
          path,
        );
        if (projectedValue == null) {
          // null bubbles up from a missing non-nullable field inside the fragment
          return null;
        }
        Object.assign(
          result,
          mergeDeep([result, projectedValue], false, true, true),
        );
      } else {
        // If data doesn't have a __typename, use the current parentType
        // and check if it satisfies the type condition
        if (
          typeCondition &&
          !entitySatisfiesTypeCondition(
            executionContext.supergraphSchema,
            parentType.name,
            typeCondition,
          )
        ) {
          continue;
        }
        const projectedValue = projectSelectionSet(
          data,
          selection.selectionSet,
          typeCondition
            ? executionContext.supergraphSchema.getType(typeCondition)!
            : parentType,
          executionContext,
          path,
        );
        if (projectedValue == null) {
          return null;
        }
        Object.assign(
          result,
          mergeDeep([result, projectedValue], false, true, true),
        );
      }
    } else if (selection.kind === 'FragmentSpread') {
      const fragment = executionContext.fragments[selection.name.value];
      if (!fragment) {
        throw new Error(`Fragment "${selection.name.value}" not found`);
      }
      const typeCondition = fragment.typeCondition?.name.value;
      if (
        isEntityRepresentation(data) &&
        typeCondition &&
        !entitySatisfiesTypeCondition(
          executionContext.supergraphSchema,
          data.__typename,
          typeCondition,
        )
      ) {
        continue;
      }
      const typeByTypename = executionContext.supergraphSchema.getType(
        data.__typename || typeCondition,
      );
      if (!isOutputType(typeByTypename)) {
        throw new Error('Invalid type');
      }
      const projectedValue = projectSelectionSet(
        data,
        fragment.selectionSet,
        typeByTypename,
        executionContext,
        path,
      );
      if (projectedValue == null) {
        return null;
      }
      Object.assign(
        result,
        mergeDeep([result, projectedValue], false, true, true),
      );
    }
  }
  return result;
}

/**
 * After execution of the execution, in order to remove the extra data in the response,
 * the data is projected based on the original selection set of the operation.
 */
function projectDataByOperation(executionContext: QueryPlanExecutionContext) {
  const rootType = executionContext.supergraphSchema.getRootType(
    executionContext.operation.operation,
  );
  if (!rootType) {
    throw new Error('Root type not found');
  }
  return projectSelectionSet(
    executionContext.data,
    executionContext.operation.selectionSet,
    rootType,
    executionContext,
    [],
  );
}

/**
 * This helper function projects the entity data based on the selections in the requires of Fetch Node,
 * so only the required data is sent to the subgraph.
 *
 * Not the same with `projectDocumentNode`, because `Requires` is not the same with `SelectionNode`
 */
function projectRequires(
  requiresSelections: RequiresSelection[],
  entity: EntityRepresentation[],
  supergraphSchema: GraphQLSchema,
): EntityRepresentation[];
function projectRequires(
  requiresSelections: RequiresSelection[],
  entity: EntityRepresentation,
  supergraphSchema: GraphQLSchema,
): EntityRepresentation;
function projectRequires(
  requiresSelections: RequiresSelection[],
  entity: EntityRepresentation | EntityRepresentation[],
  supergraphSchema: GraphQLSchema,
): EntityRepresentation | EntityRepresentation[] | null {
  if (!entity) {
    return entity;
  }
  if (Array.isArray(entity)) {
    return entity.map((item) =>
      projectRequires(requiresSelections, item, supergraphSchema),
    );
  }
  const result = {} as EntityRepresentation;
  for (const requiresSelection of requiresSelections) {
    switch (requiresSelection.kind) {
      case 'Field': {
        const fieldName = requiresSelection.name;
        const responseKey = requiresSelection.alias ?? fieldName;
        let original = entity[fieldName];
        if (original === undefined) {
          original = entity[responseKey];
        }
        const projectedValue = requiresSelection.selections
          ? projectRequires(
              requiresSelection.selections,
              original,
              supergraphSchema,
            )
          : original;
        if (projectedValue != null) {
          result[responseKey] = projectedValue;
        }
        break;
      }
      case 'InlineFragment':
        if (
          entitySatisfiesTypeCondition(
            supergraphSchema,
            entity.__typename,
            requiresSelection.typeCondition,
          )
        ) {
          const projected = projectRequires(
            requiresSelection.selections,
            entity,
            supergraphSchema,
          );
          if (projected) {
            Object.assign(
              result,
              mergeDeep([result, projected], false, true, true),
            );
          }
        }
        break;
    }
  }
  if (
    (Object.keys(result).length === 1 && result.__typename) ||
    Object.keys(result).length === 0
  ) {
    return null;
  }
  return result;
}
