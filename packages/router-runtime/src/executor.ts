import { documentStringMap } from '@envelop/core';
import type {
  BatchFetchNode,
  FetchNodePathSegment,
  FetchRewrite,
  FlattenNodePathSegment,
  PlanNode,
  QueryPlan,
  RequiresSelection,
} from '@graphql-hive/router-query-planner';
import {
  getFragmentsFromDocument,
  getVariableValues,
} from '@graphql-tools/executor';
import {
  ExecutionRequest,
  getDirective,
  getOperationASTFromDocument,
  getOperationASTFromRequest,
  isAsyncIterable,
  MaybeAsyncIterable,
  memoize1,
  mergeDeep,
  relocatedError,
  type ExecutionResult,
} from '@graphql-tools/utils';
import {
  handleMaybePromise,
  isPromise,
  mapAsyncIterator,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';
import type {
  DirectiveNode,
  DocumentNode,
  FragmentDefinitionNode,
  GraphQLEnumType,
  GraphQLError,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLSchema,
  OperationDefinitionNode,
  OperationTypeNode,
  SelectionSetNode,
} from 'graphql';
import {
  getNamedType,
  isAbstractType,
  isEnumType,
  isInterfaceType,
  isNonNullType,
  isObjectType,
  isOutputType,
  Kind,
  parse,
  TypeNameMetaFieldDef,
} from 'graphql';

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

  /**
   * Precompiled operation projection plan for response shaping
   */
  compiledProjection: CompiledProjectionPlan;

  /**
   * Runtime caches used while projecting data
   */
  projectionRuntimeCache: ProjectionRuntimeCache;
}

type CompiledDirectiveCondition =
  | { kind: 'AlwaysExclude' }
  | { kind: 'SkipIf'; variableName: string }
  | { kind: 'SkipIf'; value: boolean }
  | { kind: 'IncludeIf'; variableName: string }
  | { kind: 'IncludeIf'; value: boolean };

interface CompiledFieldSelection {
  kind: 'Field';
  fieldName: string;
  responseKey: string;
  directiveConditions?: CompiledDirectiveCondition[];
  selectionSet?: CompiledProjectionSelectionSet;
}

interface CompiledInlineFragmentSelection {
  kind: 'InlineFragment';
  typeCondition?: string;
  directiveConditions?: CompiledDirectiveCondition[];
  selectionSet: CompiledProjectionSelectionSet;
}

interface CompiledFragmentSpreadSelection {
  kind: 'FragmentSpread';
  fragmentName: string;
  directiveConditions?: CompiledDirectiveCondition[];
}

type CompiledProjectionSelection =
  | CompiledFieldSelection
  | CompiledInlineFragmentSelection
  | CompiledFragmentSpreadSelection;

interface CompiledProjectionSelectionSet {
  selections: CompiledProjectionSelection[];
}

interface CompiledProjectionFragment {
  typeCondition?: string;
  selectionSet: CompiledProjectionSelectionSet;
}

interface CompiledProjectionPlan {
  rootSelectionSet: CompiledProjectionSelectionSet;
  fragments: Record<string, CompiledProjectionFragment>;
}

interface CompiledProjectionArtifacts {
  operation: OperationDefinitionNode;
  fragments: Record<string, FragmentDefinitionNode>;
  compiledProjection: CompiledProjectionPlan;
}

interface CompiledRequiresFieldSelection {
  kind: 'Field';
  fieldName: string;
  responseKey: string;
  selections?: CompiledRequiresSelection[];
}

interface CompiledRequiresInlineFragmentSelection {
  kind: 'InlineFragment';
  typeCondition?: string | readonly string[];
  selections: CompiledRequiresSelection[];
}

type CompiledRequiresSelection =
  | CompiledRequiresFieldSelection
  | CompiledRequiresInlineFragmentSelection;

interface RequiresProjectionRuntime {
  supergraphSchema: GraphQLSchema;
  entityTypeConditionResult: Map<string, boolean>;
}

interface ProjectionFieldMeta {
  field: GraphQLField<any, any>;
  namedType: GraphQLNamedType;
  enumType?: GraphQLEnumType;
  isNonNull: boolean;
}

interface ProjectionRuntimeCache {
  fieldMetaByParentType: WeakMap<
    GraphQLObjectType | GraphQLInterfaceType,
    Map<string, ProjectionFieldMeta | null>
  >;
  inaccessibleByObjectType: WeakMap<GraphQLObjectType, boolean>;
  enumProjectionValueByType: WeakMap<GraphQLEnumType, Map<any, any>>;
  entityTypeConditionResult: Map<string, boolean>;
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
  function handleResp() {
    const executionResult = {} as ExecutionResult;
    if (Object.keys(executionContext.data).length > 0) {
      executionResult.data = projectDataByOperation(executionContext);
    }
    if (executionContext.errors.length > 0) {
      executionResult.errors = executionContext.errors;
    }
    return executionResult;
  }
  return handleMaybePromise(
    () => executePlanNode(node, executionContext),
    (res) => {
      if (isAsyncIterable(res)) {
        return mapAsyncIterator(res, handleResp);
      }
      return handleResp();
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
const projectionArtifactsByDocument = new WeakMap<
  DocumentNode,
  Map<string | null, CompiledProjectionArtifacts>
>();
const compiledRequiresCache = new WeakMap<
  RequiresSelection[],
  CompiledRequiresSelection[]
>();

function createQueryPlanExecutionContext({
  supergraphSchema,
  executionRequest,
  onSubgraphExecute,
}: CreateExecutionContextOpts): QueryPlanExecutionContext {
  const { operation, fragments, compiledProjection } =
    getOrCreateCompiledProjectionArtifacts(executionRequest);

  let variableValues = executionRequest.variables;
  if (operation.variableDefinitions) {
    const variableValuesResult = getVariableValues(
      supergraphSchema,
      operation.variableDefinitions,
      variableValues || globalEmpty,
    );
    if (variableValuesResult.errors?.length) {
      if (variableValuesResult.errors.length === 1) {
        throw variableValuesResult.errors[0];
      }
      if (variableValuesResult.errors.length > 1) {
        throw new AggregateError(
          variableValuesResult.errors,
          'Variable parsing error',
        );
      }
    }
    if (variableValuesResult.coerced) {
      variableValues = variableValuesResult.coerced;
    }
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
    compiledProjection,
    projectionRuntimeCache: {
      fieldMetaByParentType: new WeakMap(),
      inaccessibleByObjectType: new WeakMap(),
      enumProjectionValueByType: new WeakMap(),
      entityTypeConditionResult: new Map(),
    },
  };
}

type NormalizedFlattenNodePathSegment =
  | { kind: 'Field'; name: string }
  | { kind: 'Cast'; typeCondition: string[] }
  | { kind: 'List' };

interface EntityLocation {
  entity: EntityRepresentation;
  path: (string | number)[];
}

interface FlattenPreparedContext {
  entityRefs: EntityRepresentation[];
  dedupedRepresentations: EntityRepresentation[];
  entityPaths: (string | number)[][];
  representationOrder: number[];
  errorPath?: string[];
}

interface BatchAliasPreparedPath {
  entityRefs: EntityRepresentation[];
  entityPaths: (string | number)[][];
  representationIndexByTarget: number[];
}

interface BatchAliasPreparedContext {
  alias: string;
  pathStates: BatchAliasPreparedPath[];
  entityPathsByRepresentationIndex: Map<number, (string | number)[][]>;
  outputRewrites?: FetchRewrite[];
}

interface BatchVariablePreparedContext {
  representations: EntityRepresentation[];
  identityToEntityIndex: Map<number, number>;
}

interface BatchPreparedContext {
  byAlias: Map<string, BatchAliasPreparedContext>;
  representationsByVariableName: Map<string, BatchVariablePreparedContext>;
}

interface ExecutionState {
  representations?: EntityRepresentation[];
  errorPath?: (string | number)[];
  flatten?: FlattenPreparedContext;
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

function collectFlattenEntities(
  source: Record<string, any>,
  pathSegments: NormalizedFlattenNodePathSegment[],
  supergraphSchema: GraphQLSchema,
): EntityLocation[] {
  const entities: EntityLocation[] = [];
  const activePath: (string | number)[] = [];
  traverseFlattenPath(
    source,
    pathSegments,
    supergraphSchema,
    activePath,
    (value: unknown, path) => {
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
          const item = value[index];
          if (item && typeof item === 'object') {
            path.push(index);
            entities.push({
              entity: item as EntityRepresentation,
              path: path.slice(),
            });
            path.pop();
          }
        }
        return;
      }
      if (value && typeof value === 'object') {
        entities.push({
          entity: value as EntityRepresentation,
          path: path.slice(),
        });
      }
    },
  );
  return entities;
}

function traverseFlattenPath(
  current: unknown,
  remainingPath: NormalizedFlattenNodePathSegment[],
  supergraphSchema: GraphQLSchema,
  path: (string | number)[],
  callback: (value: unknown, path: (string | number)[]) => void,
): void {
  if (current == null) {
    return;
  }
  const [segment, ...rest] = remainingPath;
  if (!segment /* same as remainingPath.length === 0 */) {
    callback(current, path);
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
            callback,
          );
        }
        return;
      }
      if (typeof current === 'object') {
        path.push(segment.name);
        const next = (current as Record<string, any>)[segment.name];
        traverseFlattenPath(next, rest, supergraphSchema, path, callback);
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
          traverseFlattenPath(current, rest, supergraphSchema, path, callback);
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

  const pathSegments = normalizeFlattenNodePath(flattenNode.path);
  const entityLocations = collectFlattenEntities(
    executionContext.data,
    pathSegments,
    executionContext.supergraphSchema,
  );
  if (entityLocations.length === 0) {
    return null;
  }

  const entityRefs: EntityRepresentation[] = [];
  const entityPaths: (string | number)[][] = [];
  const representationOrder: number[] = [];
  const dedupedRepresentations: EntityRepresentation[] = [];
  const representationKeyToIndex = new Map<number, number>();

  for (const location of entityLocations) {
    const entityRef = location.entity;
    if (!isEntityRepresentation(entityRef)) {
      continue;
    }

    let representation = projectRequires(
      requires,
      entityRef,
      executionContext.supergraphSchema,
    );
    if (!representation || Array.isArray(representation)) {
      continue;
    }
    representation.__typename ??= entityRef.__typename;

    if (fetchNode.inputRewrites?.length) {
      representation = applyInputRewrites(
        representation,
        fetchNode.inputRewrites,
        executionContext.supergraphSchema,
      );
    }

    const dedupeKey = stableStringify(representation);
    let dedupIndex = representationKeyToIndex.get(dedupeKey);
    if (dedupIndex === undefined) {
      dedupIndex = dedupedRepresentations.length;
      representationKeyToIndex.set(dedupeKey, dedupIndex);
      dedupedRepresentations.push(representation);
    }

    entityRefs.push(entityRef);
    entityPaths.push(location.path);
    representationOrder.push(dedupIndex);
  }

  if (dedupedRepresentations.length === 0) {
    return null;
  }

  const errorPath = pathSegments
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
    entityRefs,
    dedupedRepresentations,
    entityPaths,
    representationOrder,
    errorPath: errorPath.length ? errorPath : undefined,
  };
}

function prepareBatchFetchContext(
  batchFetchNode: BatchFetchNode,
  executionContext: QueryPlanExecutionContext,
): BatchPreparedContext | null {
  const byAlias = new Map<string, BatchAliasPreparedContext>();
  const representationsByVariableName = new Map<
    string,
    BatchVariablePreparedContext
  >();

  for (const alias of batchFetchNode.entityBatch.aliases) {
    const requires = alias.requires;
    if (!requires || requires.length === 0) {
      continue;
    }

    const pathStates: BatchAliasPreparedPath[] = [];
    const entityPathsByRepresentationIndex = new Map<
      number,
      (string | number)[][]
    >();
    const representationsVariableName = alias.representationsVariableName;
    let variableBatchState = representationsByVariableName.get(
      representationsVariableName,
    );
    if (!variableBatchState) {
      variableBatchState = {
        representations: [],
        identityToEntityIndex: new Map<number, number>(),
      };
      representationsByVariableName.set(
        representationsVariableName,
        variableBatchState,
      );
    }
    const ensuredVariableBatchState = variableBatchState;

    for (const path of alias.paths) {
      const normalizedPath = normalizeFlattenNodePath(path);
      const entityLocations = collectFlattenEntities(
        executionContext.data,
        normalizedPath,
        executionContext.supergraphSchema,
      );
      const entityRefs: EntityRepresentation[] = [];
      const entityPaths: (string | number)[][] = [];
      const representationIndexByTarget: number[] = [];

      for (const location of entityLocations) {
        const entityRef = location.entity;
        if (!isEntityRepresentation(entityRef)) {
          continue;
        }

        let representation = projectRequires(
          requires,
          entityRef,
          executionContext.supergraphSchema,
        );
        if (!representation || Array.isArray(representation)) {
          continue;
        }
        representation.__typename ??= entityRef.__typename;

        if (alias.inputRewrites?.length) {
          representation = applyInputRewrites(
            representation,
            alias.inputRewrites,
            executionContext.supergraphSchema,
          );
        }

        const identity = stableStringify(representation);
        let dedupIndex =
          ensuredVariableBatchState.identityToEntityIndex.get(identity);
        if (dedupIndex == null) {
          dedupIndex = ensuredVariableBatchState.representations.length;
          ensuredVariableBatchState.identityToEntityIndex.set(
            identity,
            dedupIndex,
          );
          ensuredVariableBatchState.representations.push(representation);
        }

        entityRefs.push(entityRef);
        entityPaths.push(location.path);
        representationIndexByTarget.push(dedupIndex);

        const pathsForRepresentation =
          entityPathsByRepresentationIndex.get(dedupIndex) ?? [];
        pathsForRepresentation.push(location.path);
        entityPathsByRepresentationIndex.set(
          dedupIndex,
          pathsForRepresentation,
        );
      }

      pathStates.push({
        entityRefs,
        entityPaths,
        representationIndexByTarget,
      });
    }

    byAlias.set(alias.alias, {
      alias: alias.alias,
      pathStates,
      entityPathsByRepresentationIndex,
      outputRewrites: alias.outputRewrites,
    });
  }

  const hasRepresentations = Array.from(
    representationsByVariableName.values(),
  ).some((state) => state.representations.length > 0);
  if (!hasRepresentations) {
    return null;
  }

  return {
    byAlias,
    representationsByVariableName,
  };
}

function buildBatchFetchVariables(
  batchContext: BatchPreparedContext,
  selectedVariables: Record<string, any> | undefined,
): Record<string, any> | undefined {
  let variablesForFetch: Record<string, any> | undefined;
  if (selectedVariables) {
    variablesForFetch = { ...selectedVariables };
  }
  for (const [
    variableName,
    state,
  ] of batchContext.representationsByVariableName.entries()) {
    if (!state.representations.length) {
      continue;
    }
    const targetVariables =
      variablesForFetch ?? (Object.create(null) as Record<string, any>);
    if (!variablesForFetch) {
      variablesForFetch = targetVariables;
    }
    targetVariables[variableName] = state.representations;
  }
  return variablesForFetch;
}

function applyBatchAliasEntities(
  returnedEntities: EntityRepresentation[],
  aliasContext: BatchAliasPreparedContext,
) {
  for (const pathContext of aliasContext.pathStates) {
    const { entityRefs, representationIndexByTarget } = pathContext;
    for (let index = 0; index < entityRefs.length; index++) {
      const target = entityRefs[index];
      const dedupIndex = representationIndexByTarget[index];
      if (dedupIndex == null) {
        continue;
      }
      const entity = returnedEntities[dedupIndex];
      if (!target || !entity) {
        continue;
      }
      mergeEntityPayload(target, entity);
    }
  }
}

function normalizeBatchFetchErrors(
  errors: readonly GraphQLError[],
  batchContext: BatchPreparedContext,
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
    if (!aliasContext) {
      relocated.push(error);
      continue;
    }

    const entityIndex = errorPath[1];
    if (typeof entityIndex !== 'number') {
      relocated.push(error);
      continue;
    }

    const mappedPaths =
      aliasContext.entityPathsByRepresentationIndex.get(entityIndex);
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

  const variablesForFetch = buildBatchFetchVariables(
    batchContext,
    selectedVariables,
  );

  const handleBatchResult = (
    fetchResult: MaybeAsyncIterable<ExecutionResult<any, any>>,
  ): MaybeAsyncIterable<unknown> | void => {
    if (isAsyncIterable(fetchResult)) {
      return mapAsyncIterator(fetchResult, handleBatchResult);
    }

    if (fetchResult.errors?.length) {
      executionContext.errors.push(
        ...normalizeBatchFetchErrors(fetchResult.errors, batchContext),
      );
    }

    const responseData = fetchResult.data;
    if (!responseData || typeof responseData !== 'object') {
      return;
    }

    for (const [aliasName, aliasContext] of batchContext.byAlias.entries()) {
      let aliasData = (responseData as Record<string, any>)[aliasName];
      if (!aliasData) {
        continue;
      }
      if (aliasContext.outputRewrites?.length) {
        aliasData = applyOutputRewrites(
          aliasData,
          aliasContext.outputRewrites,
          executionContext.supergraphSchema,
        );
      }
      if (Array.isArray(aliasData)) {
        applyBatchAliasEntities(
          aliasData as EntityRepresentation[],
          aliasContext,
        );
      }
    }
    return;
  };

  return handleMaybePromise(
    () =>
      executionContext.onSubgraphExecute(batchFetchNode.serviceName, {
        document: getDocumentNodeOfFetchingNode(batchFetchNode),
        variables: variablesForFetch,
        operationType:
          (batchFetchNode.operationKind as OperationTypeNode | undefined) ??
          executionContext.operation.operation,
        operationName: batchFetchNode.operationName,
        extensions: executionContext.executionRequest.extensions,
        rootValue: executionContext.executionRequest.rootValue,
        context: executionContext.executionRequest.context,
        subgraphName: batchFetchNode.serviceName,
        info: executionContext.executionRequest.info,
        signal: executionContext.executionRequest.signal,
      }),
    handleBatchResult,
  );
}

function executeFetchPlanNode(
  fetchNode: Extract<PlanNode, { kind: 'Fetch' }>,
  executionContext: QueryPlanExecutionContext,
  state?: ExecutionState,
): MaybePromise<any> {
  const flattenState = state?.flatten;
  let representationTargets =
    flattenState?.entityRefs ?? state?.representations;
  let preparedRepresentations: EntityRepresentation[] | undefined;

  if (flattenState) {
    if (!flattenState.dedupedRepresentations.length) {
      return;
    }
    preparedRepresentations = flattenState.dedupedRepresentations;
  } else if (representationTargets?.length) {
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

  const defaultErrorPath =
    state?.errorPath ??
    state?.flatten?.errorPath ??
    getDefaultErrorPath(fetchNode);

  const handleFetchResult = (
    fetchResult: MaybeAsyncIterable<ExecutionResult<any, any>>,
  ): MaybeAsyncIterable<unknown> | void => {
    if (isAsyncIterable(fetchResult)) {
      return mapAsyncIterator(fetchResult, handleFetchResult);
    }

    if (fetchResult.errors?.length) {
      const normalizedErrors = normalizeFetchErrors(fetchResult.errors, {
        fetchNode,
        state,
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

    if (flattenState && flattenState.entityRefs.length) {
      const returnedEntities = responseData._entities as
        | EntityRepresentation[]
        | undefined;
      if (Array.isArray(returnedEntities)) {
        mergeFlattenEntities(returnedEntities, flattenState);
      }
      return;
    }

    if (representationTargets?.length && responseData._entities) {
      const returnedEntities: EntityRepresentation[] = responseData._entities;
      for (let index = 0; index < returnedEntities.length; index++) {
        const entity = returnedEntities[index];
        const target = representationTargets[index];
        if (target && entity) {
          mergeEntityPayload(target, entity);
        }
      }
      return;
    }

    mergeEntityPayload(executionContext.data, responseData);
    return;
  };

  return handleMaybePromise(
    () =>
      executionContext.onSubgraphExecute(fetchNode.serviceName, {
        document: getDocumentNodeOfFetchingNode(fetchNode),
        variables: variablesForFetch,
        operationType:
          (fetchNode.operationKind as OperationTypeNode | undefined) ??
          executionContext.operation.operation,
        operationName: fetchNode.operationName,
        extensions: executionContext.executionRequest.extensions,
        rootValue: executionContext.executionRequest.rootValue,
        context: executionContext.executionRequest.context,
        subgraphName: fetchNode.serviceName,
        info: executionContext.executionRequest.info,
        signal: executionContext.executionRequest.signal,
      }),
    handleFetchResult,
  );
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
    state?: ExecutionState;
    defaultPath?: (string | number)[];
  },
): GraphQLError[] {
  if (!errors.length) {
    return [];
  }
  const { fetchNode, state } = options;
  const flattenState = state?.flatten;
  const fallbackPath = options.defaultPath ?? getDefaultErrorPath(fetchNode);

  if (!flattenState) {
    if (!fallbackPath) {
      return [...errors];
    }
    return errors.map((error) => relocatedError(error, fallbackPath));
  }

  const entityPathMap = buildFlattenEntityPathMap(flattenState);
  const relocated: GraphQLError[] = [];

  for (const error of errors) {
    const errorPath = error.path;
    if (errorPath) {
      const entityIndexPosition = errorPath.indexOf('_entities');
      if (entityIndexPosition !== -1) {
        const dedupIndex = errorPath[entityIndexPosition + 1];
        if (typeof dedupIndex === 'number') {
          const mappedPaths = entityPathMap.get(dedupIndex);
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

function buildFlattenEntityPathMap(
  flattenState: FlattenPreparedContext,
): Map<number, (string | number)[][]> {
  const map = new Map<number, (string | number)[][]>();
  flattenState.representationOrder.forEach((dedupIndex, index) => {
    const existing = map.get(dedupIndex);
    if (existing) {
      existing.push(flattenState.entityPaths[index]!);
    } else {
      map.set(dedupIndex, [flattenState.entityPaths[index]!]);
    }
  });
  return map;
}

function mergeFlattenEntities(
  returnedEntities: EntityRepresentation[],
  flattenState: FlattenPreparedContext,
) {
  const { entityRefs, representationOrder } = flattenState;
  for (let index = 0; index < entityRefs.length; index++) {
    const target = entityRefs[index];
    const dedupIndex = representationOrder[index]!; // there must be one
    const entity = returnedEntities[dedupIndex];
    if (!target || !entity) {
      continue;
    }
    mergeEntityPayload(target, entity);
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

function stableStringify(value: unknown) {
  return hashValueOrderIndependent32Ultra(value);
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
        pending = handleMaybePromise(
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
      const errorPath =
        flattenContext.errorPath && flattenContext.errorPath.length
          ? [...flattenContext.errorPath]
          : undefined;
      return executePlanNode(planNode.node, executionContext, {
        representations: flattenContext.entityRefs,
        errorPath,
        flatten: flattenContext,
      });
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
      return executePlanNode(planNode.primary, executionContext);
    }
    default:
      throw new Error(`Invalid plan node: ${JSON.stringify(planNode)}`);
  }
}

type NormalizedRewrite =
  | { kind: 'ValueSetter'; path: string[]; setValueTo: string }
  | { kind: 'KeyRenamer'; path: string[]; renameKeyTo: string };

function normalizeRewrite(rewrite: FetchRewrite): NormalizedRewrite {
  if ('kind' in rewrite && rewrite.kind === 'ValueSetter') {
    // TODO: why sometimes rewrite.kind = 'ValueSetter'?
    return {
      ...rewrite,
      path: normalizeRewritePath(rewrite.path),
    };
  }
  if ('ValueSetter' in rewrite) {
    return {
      kind: 'ValueSetter',
      path: normalizeRewritePath(rewrite.ValueSetter?.path),
      setValueTo: rewrite.ValueSetter?.setValueTo,
    };
  }
  if ('KeyRenamer' in rewrite) {
    return {
      kind: 'KeyRenamer',
      path: normalizeRewritePath(rewrite.KeyRenamer?.path),
      renameKeyTo: rewrite.KeyRenamer?.renameKeyTo,
    };
  }
  throw new Error(`Unsupported fetch node rewrite: ${JSON.stringify(rewrite)}`);
}

function normalizeRewritePath(path: FetchNodePathSegment[]): string[] {
  const normalized: string[] = [];
  for (const segment of path) {
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
  selectionSet: CompiledProjectionSelectionSet,
  type: GraphQLNamedType,
  executionContext: QueryPlanExecutionContext,
): any {
  if (data == null) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) =>
      projectSelectionSet(item, selectionSet, type, executionContext),
    );
  }
  const parentType = isEntityRepresentation(data)
    ? executionContext.supergraphSchema.getType(data.__typename)
    : type;
  if (!isObjectType(parentType) && !isInterfaceType(parentType)) {
    return null;
  }
  if (
    isObjectType(parentType) &&
    isInaccessibleObjectType(parentType, executionContext)
  ) {
    return null;
  }
  const result: Record<string, any> = {};
  for (const selection of selectionSet.selections) {
    if (
      !shouldIncludeCompiledSelection(
        selection.directiveConditions,
        executionContext.variableValues,
      )
    ) {
      continue;
    }
    if (selection.kind === 'Field') {
      const fieldMeta = getProjectionFieldMeta(
        parentType,
        selection.fieldName,
        executionContext,
      );
      if (!fieldMeta) {
        throw new Error(
          `Field not found: ${selection.fieldName} on ${parentType.name}`,
        );
      }
      const responseKey = selection.responseKey;
      let projectedValue = selection.selectionSet
        ? projectSelectionSet(
            data[responseKey],
            selection.selectionSet,
            fieldMeta.namedType,
            executionContext,
          )
        : data[responseKey];
      if (projectedValue !== undefined) {
        if (fieldMeta.enumType) {
          projectedValue = projectEnumValue(
            projectedValue,
            fieldMeta.enumType,
            executionContext,
          );
        }
        if (result[responseKey] == null) {
          result[responseKey] = projectedValue;
        } else if (
          typeof result[responseKey] === 'object' &&
          projectedValue != null
        ) {
          result[responseKey] = mergeProjectedFieldValue(
            result[responseKey],
            projectedValue,
          );
        } else {
          result[responseKey] = projectedValue;
        }
      } else if (fieldMeta.field.name === '__typename') {
        result[responseKey] = type.name;
      } else if (fieldMeta.isNonNull) {
        return null;
      } else {
        result[responseKey] = null;
      }
    } else if (selection.kind === 'InlineFragment') {
      const typeCondition = selection.typeCondition;
      // If data has a __typename, check if it matches the type condition
      if (isEntityRepresentation(data)) {
        if (
          typeCondition &&
          !entitySatisfiesTypeConditionCached(
            executionContext,
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
        );
        mergeProjectedSelectionObject(result, projectedValue);
      } else {
        // If data doesn't have a __typename, use the current parentType
        // and check if it satisfies the type condition
        if (
          typeCondition &&
          !entitySatisfiesTypeConditionCached(
            executionContext,
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
        );
        mergeProjectedSelectionObject(result, projectedValue);
      }
    } else if (selection.kind === 'FragmentSpread') {
      const fragment =
        executionContext.compiledProjection.fragments[selection.fragmentName];
      if (!fragment) {
        throw new Error(`Fragment "${selection.fragmentName}" not found`);
      }
      const typeCondition = fragment.typeCondition;
      if (
        isEntityRepresentation(data) &&
        typeCondition &&
        !entitySatisfiesTypeConditionCached(
          executionContext,
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
      );
      mergeProjectedSelectionObject(result, projectedValue);
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
    executionContext.compiledProjection.rootSelectionSet,
    rootType,
    executionContext,
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
  const runtime: RequiresProjectionRuntime = {
    supergraphSchema,
    entityTypeConditionResult: new Map(),
  };
  const compiledRequiresSelections =
    getOrCompileRequiresSelections(requiresSelections);
  return projectRequiresCompiled(compiledRequiresSelections, entity, runtime);
}

function projectRequiresCompiled(
  requiresSelections: CompiledRequiresSelection[],
  entity: EntityRepresentation | EntityRepresentation[],
  runtime: RequiresProjectionRuntime,
): EntityRepresentation | EntityRepresentation[] | null {
  if (!entity) {
    return entity;
  }
  if (Array.isArray(entity)) {
    return entity.map((item) =>
      projectRequiresCompiled(requiresSelections, item, runtime),
    ) as EntityRepresentation[];
  }
  let result: EntityRepresentation | null = null;
  for (const requiresSelection of requiresSelections) {
    switch (requiresSelection.kind) {
      case 'Field': {
        let original = entity[requiresSelection.fieldName];
        if (original === undefined) {
          original = entity[requiresSelection.responseKey];
        }
        const projectedValue = requiresSelection.selections
          ? projectRequiresCompiled(
              requiresSelection.selections,
              original,
              runtime,
            )
          : original;
        if (projectedValue != null) {
          result ??= {} as EntityRepresentation;
          result[requiresSelection.responseKey] = projectedValue;
        }
        break;
      }
      case 'InlineFragment': {
        if (
          entitySatisfiesTypeConditionForRequires(
            runtime,
            entity.__typename,
            requiresSelection.typeCondition,
          )
        ) {
          const projected = projectRequiresCompiled(
            requiresSelection.selections,
            entity,
            runtime,
          );
          if (projected) {
            result ??= {} as EntityRepresentation;
            mergeEntityPayload(result, projected);
          }
        }
        break;
      }
    }
  }
  if (!result) {
    return null;
  }
  for (const key in result) {
    if (key !== '__typename') {
      return result;
    }
  }
  return null;
}

function entitySatisfiesTypeConditionForRequires(
  runtime: RequiresProjectionRuntime,
  typeNameInEntity: string,
  typeConditionInInlineFragment: string | readonly string[] | undefined,
): boolean {
  if (!typeConditionInInlineFragment) {
    return false;
  }
  const typeConditionCacheKey = Array.isArray(typeConditionInInlineFragment)
    ? typeConditionInInlineFragment.join(',')
    : typeConditionInInlineFragment;
  const cacheKey = `${typeNameInEntity}::${typeConditionCacheKey}`;
  const cachedResult = runtime.entityTypeConditionResult.get(cacheKey);
  if (cachedResult != null) {
    return cachedResult;
  }
  const result = entitySatisfiesTypeCondition(
    runtime.supergraphSchema,
    typeNameInEntity,
    typeConditionInInlineFragment,
  );
  runtime.entityTypeConditionResult.set(cacheKey, result);
  return result;
}

function getOperationProjectionCacheKey(executionRequest: ExecutionRequest) {
  return executionRequest.operationName ?? null;
}

/**
 * Cache compiled projection artifacts by parsed DocumentNode identity and operationName.
 * WeakMap keeps memory bounded to document lifecycle without explicit invalidation.
 */
function getOrCreateCompiledProjectionArtifacts(
  executionRequest: ExecutionRequest,
): CompiledProjectionArtifacts {
  let artifactsByOperation = projectionArtifactsByDocument.get(
    executionRequest.document,
  );
  if (!artifactsByOperation) {
    artifactsByOperation = new Map();
    projectionArtifactsByDocument.set(
      executionRequest.document,
      artifactsByOperation,
    );
  }

  const cacheKey = getOperationProjectionCacheKey(executionRequest);
  const cachedArtifacts = artifactsByOperation.get(cacheKey);
  if (cachedArtifacts) {
    return cachedArtifacts;
  }

  const fragments = getFragmentsFromDocument(executionRequest.document);
  const operation = getOperationASTFromRequest(executionRequest);
  const artifacts: CompiledProjectionArtifacts = {
    operation,
    fragments,
    compiledProjection: compileProjectionPlan(operation, fragments),
  };
  artifactsByOperation.set(cacheKey, artifacts);
  return artifacts;
}

/**
 * Requires selections are planner-owned structures; identity cache is stable per plan.
 */
function getOrCompileRequiresSelections(
  requiresSelections: RequiresSelection[],
): CompiledRequiresSelection[] {
  const cached = compiledRequiresCache.get(requiresSelections);
  if (cached) {
    return cached;
  }
  const compiled = compileRequiresSelections(requiresSelections);
  compiledRequiresCache.set(requiresSelections, compiled);
  return compiled;
}

function compileRequiresSelections(
  requiresSelections: RequiresSelection[],
): CompiledRequiresSelection[] {
  const compiled: CompiledRequiresSelection[] = [];
  for (const requiresSelection of requiresSelections) {
    switch (requiresSelection.kind) {
      case 'Field': {
        compiled.push({
          kind: 'Field',
          fieldName: requiresSelection.name,
          responseKey: requiresSelection.alias ?? requiresSelection.name,
          selections: requiresSelection.selections
            ? compileRequiresSelections(requiresSelection.selections)
            : undefined,
        });
        break;
      }
      case 'InlineFragment': {
        compiled.push({
          kind: 'InlineFragment',
          typeCondition: requiresSelection.typeCondition,
          selections: compileRequiresSelections(requiresSelection.selections),
        });
        break;
      }
      default:
        throw new Error(
          `Unsupported requires selection kind: ${(requiresSelection as any).kind}`,
        );
    }
  }
  return compiled;
}

function compileProjectionPlan(
  operation: OperationDefinitionNode,
  fragments: Record<string, FragmentDefinitionNode>,
): CompiledProjectionPlan {
  const compiledFragments: Record<string, CompiledProjectionFragment> = {};
  for (const fragmentName in fragments) {
    const fragment = fragments[fragmentName];
    if (!fragment) {
      continue;
    }
    compiledFragments[fragmentName] = {
      typeCondition: fragment.typeCondition?.name.value,
      selectionSet: compileProjectionSelectionSet(fragment.selectionSet),
    };
  }
  return {
    rootSelectionSet: compileProjectionSelectionSet(operation.selectionSet),
    fragments: compiledFragments,
  };
}

function compileProjectionSelectionSet(
  selectionSet: SelectionSetNode,
): CompiledProjectionSelectionSet {
  const selections: CompiledProjectionSelection[] = [];
  for (const selection of selectionSet.selections) {
    const directiveConditions = compileDirectiveConditions(
      selection.directives,
    );
    if (selection.kind === Kind.FIELD) {
      selections.push({
        kind: 'Field',
        fieldName: selection.name.value,
        responseKey: selection.alias?.value || selection.name.value,
        directiveConditions,
        selectionSet: selection.selectionSet
          ? compileProjectionSelectionSet(selection.selectionSet)
          : undefined,
      });
      continue;
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      selections.push({
        kind: 'InlineFragment',
        typeCondition: selection.typeCondition?.name.value,
        directiveConditions,
        selectionSet: compileProjectionSelectionSet(selection.selectionSet),
      });
      continue;
    }
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      selections.push({
        kind: 'FragmentSpread',
        fragmentName: selection.name.value,
        directiveConditions,
      });
      continue;
    }
    assertNever(selection);
  }
  return { selections };
}

function compileDirectiveConditions(
  directives: readonly DirectiveNode[] | undefined,
): CompiledDirectiveCondition[] | undefined {
  if (!directives?.length) {
    return undefined;
  }
  const conditions: CompiledDirectiveCondition[] = [];
  for (const directiveNode of directives) {
    const directiveName = directiveNode.name.value;
    if (directiveName !== 'skip' && directiveName !== 'include') {
      continue;
    }
    const ifArg = directiveNode.arguments?.find(
      (arg) => arg.name.value === 'if',
    );
    if (!ifArg) {
      conditions.push({ kind: 'AlwaysExclude' });
      continue;
    }
    const ifValueNode = ifArg.value;
    if (ifValueNode.kind === Kind.VARIABLE) {
      conditions.push(
        directiveName === 'skip'
          ? { kind: 'SkipIf', variableName: ifValueNode.name.value }
          : { kind: 'IncludeIf', variableName: ifValueNode.name.value },
      );
      continue;
    }
    if (ifValueNode.kind === Kind.BOOLEAN) {
      conditions.push(
        directiveName === 'skip'
          ? { kind: 'SkipIf', value: ifValueNode.value }
          : { kind: 'IncludeIf', value: ifValueNode.value },
      );
    }
  }
  return conditions.length ? conditions : undefined;
}

function shouldIncludeCompiledSelection(
  directiveConditions: CompiledDirectiveCondition[] | undefined,
  variableValues: QueryPlanExecutionContext['variableValues'],
): boolean {
  if (!directiveConditions?.length) {
    return true;
  }
  for (const condition of directiveConditions) {
    switch (condition.kind) {
      case 'AlwaysExclude':
        return false;
      case 'SkipIf': {
        const ifValue =
          'variableName' in condition
            ? variableValues?.[condition.variableName]
            : condition.value;
        if (ifValue) {
          return false;
        }
        break;
      }
      case 'IncludeIf': {
        const ifValue =
          'variableName' in condition
            ? variableValues?.[condition.variableName]
            : condition.value;
        if (!ifValue) {
          return false;
        }
        break;
      }
      default:
        assertNever(condition);
    }
  }
  return true;
}

function getProjectionFieldMeta(
  parentType: GraphQLObjectType | GraphQLInterfaceType,
  fieldName: string,
  executionContext: QueryPlanExecutionContext,
): ProjectionFieldMeta | null {
  let byFieldName =
    executionContext.projectionRuntimeCache.fieldMetaByParentType.get(
      parentType,
    );
  if (!byFieldName) {
    byFieldName = new Map();
    executionContext.projectionRuntimeCache.fieldMetaByParentType.set(
      parentType,
      byFieldName,
    );
  }
  if (byFieldName.has(fieldName)) {
    return byFieldName.get(fieldName) || null;
  }
  const field =
    fieldName === '__typename'
      ? TypeNameMetaFieldDef
      : parentType.getFields()[fieldName];
  if (!field) {
    byFieldName.set(fieldName, null);
    return null;
  }
  const namedType = getNamedType(field.type);
  const meta: ProjectionFieldMeta = {
    field,
    namedType,
    isNonNull: isNonNullType(field.type),
    enumType: isEnumType(namedType) ? namedType : undefined,
  };
  byFieldName.set(fieldName, meta);
  return meta;
}

function isInaccessibleObjectType(
  objectType: GraphQLObjectType,
  executionContext: QueryPlanExecutionContext,
): boolean {
  const existing =
    executionContext.projectionRuntimeCache.inaccessibleByObjectType.get(
      objectType,
    );
  if (existing != null) {
    return existing;
  }
  const inaccessible = !!objectType.astNode?.directives?.find(
    (directive) => directive.name.value === 'inaccessible',
  );
  executionContext.projectionRuntimeCache.inaccessibleByObjectType.set(
    objectType,
    inaccessible,
  );
  return inaccessible;
}

function projectEnumValue(
  value: any,
  enumType: GraphQLEnumType,
  executionContext: QueryPlanExecutionContext,
): any {
  if (Array.isArray(value)) {
    return value.map((item) =>
      projectEnumValue(item, enumType, executionContext),
    );
  }
  let projectedByValue =
    executionContext.projectionRuntimeCache.enumProjectionValueByType.get(
      enumType,
    );
  if (!projectedByValue) {
    projectedByValue = new Map();
    executionContext.projectionRuntimeCache.enumProjectionValueByType.set(
      enumType,
      projectedByValue,
    );
  }
  if (projectedByValue.has(value)) {
    return projectedByValue.get(value);
  }
  const enumValue = enumType.getValue(value);
  let projected = value;
  if (enumValue == null) {
    projected = null;
  } else if (
    getDirective(executionContext.supergraphSchema, enumValue, 'inaccessible')
      ?.length
  ) {
    projected = null;
  }
  projectedByValue.set(value, projected);
  return projected;
}

function entitySatisfiesTypeConditionCached(
  executionContext: QueryPlanExecutionContext,
  typeNameInEntity: string,
  typeConditionInInlineFragment: string,
): boolean {
  const cacheKey = `${typeNameInEntity}::${typeConditionInInlineFragment}`;
  const cachedResult =
    executionContext.projectionRuntimeCache.entityTypeConditionResult.get(
      cacheKey,
    );
  if (cachedResult != null) {
    return cachedResult;
  }
  const result = entitySatisfiesTypeCondition(
    executionContext.supergraphSchema,
    typeNameInEntity,
    typeConditionInInlineFragment,
  );
  executionContext.projectionRuntimeCache.entityTypeConditionResult.set(
    cacheKey,
    result,
  );
  return result;
}

function canFastPathMergeObjects(
  left: unknown,
  right: unknown,
): left is Record<string, any> {
  return (
    typeof left === 'object' &&
    left != null &&
    !Array.isArray(left) &&
    typeof right === 'object' &&
    right != null &&
    !Array.isArray(right)
  );
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOverlappingKeys(
  left: Record<string, any>,
  right: Record<string, any>,
): boolean {
  for (const key in right) {
    if (Object.prototype.hasOwnProperty.call(left, key)) {
      return true;
    }
  }
  return false;
}

function mergeProjectedSelectionObject(
  target: Record<string, any>,
  projectedValue: any,
) {
  if (projectedValue == null) {
    return;
  }
  if (
    canFastPathMergeObjects(target, projectedValue) &&
    !hasOverlappingKeys(target, projectedValue)
  ) {
    Object.assign(target, projectedValue);
    return;
  }
  Object.assign(target, mergeDeep([target, projectedValue], false, true, true));
}

/**
 * Fast merge for entity payloads that avoids mergeDeep unless object shape overlap
 * requires deep reconciliation (nested object/array collisions).
 */
function mergeEntityPayload(
  target: Record<string, any>,
  patch: Record<string, any>,
) {
  for (const key in patch) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) {
      continue;
    }
    const patchValue = patch[key];
    if (patchValue === undefined) {
      continue;
    }
    const existingValue = target[key];
    if (existingValue === undefined) {
      target[key] = patchValue;
      continue;
    }
    if (isPlainObject(existingValue) && isPlainObject(patchValue)) {
      if (!hasOverlappingKeys(existingValue, patchValue)) {
        Object.assign(existingValue, patchValue);
        continue;
      }
      mergeEntityPayload(existingValue, patchValue);
      continue;
    }
    if (isPlainObject(existingValue) || isPlainObject(patchValue)) {
      target[key] = mergeDeep([existingValue, patchValue], false, true, true);
      continue;
    }
    if (Array.isArray(existingValue) || Array.isArray(patchValue)) {
      target[key] = mergeDeep([existingValue, patchValue], false, true, true);
      continue;
    }
    target[key] = patchValue;
  }
}

function mergeProjectedFieldValue(existingValue: any, projectedValue: any) {
  if (
    canFastPathMergeObjects(existingValue, projectedValue) &&
    !hasOverlappingKeys(existingValue, projectedValue)
  ) {
    return Object.assign(existingValue, projectedValue);
  }
  return Object.assign(
    existingValue,
    mergeDeep([existingValue, projectedValue]),
  );
}

function assertNever(_value: never): never {
  throw new Error('Unreachable code path');
}

function rotl32(value: number, by: number): number {
  return (value << by) | (value >>> (32 - by));
}

function fmix32(input: number): number {
  let h = input >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const numberBuffer = new ArrayBuffer(8);
const numberFloat64 = new Float64Array(numberBuffer);
const numberUint32 = new Uint32Array(numberBuffer);

function hashNumber32(value: number): number {
  if (!Number.isFinite(value)) {
    return 0x42108421;
  }
  numberFloat64[0] = Object.is(value, -0) ? 0 : value;
  return fmix32(numberUint32[0]! ^ rotl32(numberUint32[1]!, 13));
}

function hashString32(value: string): number {
  const cached = stringHashCache.get(value);
  if (cached != null) {
    return cached;
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hashed = hash >>> 0;
  stringHashCache.set(value, hashed);
  return hashed;
}

const stringHashCache = new Map<string, number>();

function hashNumber32Turbo(value: number): number {
  if (Number.isInteger(value)) {
    const intValue = value | 0;
    if (intValue === value) {
      return (Math.imul(intValue ^ 0x9e3779b9, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0;
    }
  }
  return hashNumber32(value);
}

function hashValueOrderIndependent32Ultra(value: unknown): number {
  if (value === null) {
    return 0x27d4eb2d;
  }
  const type = typeof value;
  if (type === 'number') {
    return (hashNumber32Turbo(value as number) ^ 0x31f8a5b7) >>> 0;
  }
  if (type === 'boolean') {
    return (value ? 0x9e3779b9 : 0x7f4a7c15) >>> 0;
  }
  if (type === 'string') {
    return (
      (Math.imul(hashString32(value as string), 0x45d9f3b) ^ 0x165667b1) >>> 0
    );
  }
  if (Array.isArray(value)) {
    let acc = (0x811c9dc5 ^ value.length) >>> 0;
    for (let i = 0; i < value.length; i++) {
      const itemHash = hashValueOrderIndependent32Ultra(value[i]);
      acc = Math.imul(acc ^ itemHash ^ i, 0x9e3779b1) >>> 0;
      acc = rotl32(acc, 5) ^ 0x85ebca6b;
    }
    return fmix32(acc ^ 0x239b961b);
  }
  if (type === 'object') {
    const obj = value as Record<string, unknown>;
    let sumAcc = 0;
    let xorAcc = 0;
    let count = 0;
    for (const key in obj) {
      const entryValue = obj[key];
      if (entryValue === undefined) {
        continue;
      }
      const keyHash = hashString32(key);
      const valueHash = hashValueOrderIndependent32Ultra(entryValue);
      const pairHash =
        Math.imul(keyHash ^ rotl32(valueHash, 9), 0x9e3779b1) >>> 0;
      sumAcc = (sumAcc + pairHash) >>> 0;
      xorAcc ^= rotl32(pairHash, pairHash & 31);
      count++;
    }
    return fmix32(sumAcc ^ xorAcc ^ count ^ 0xab0e9789);
  }
  return 0x27d4eb2d;
}
