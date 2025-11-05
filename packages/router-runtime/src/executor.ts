import type {
  FetchNodePathSegment,
  FetchRewrite,
  FlattenNodePathSegment,
  PlanNode,
  QueryPlan,
  RequiresSelection,
} from '@graphql-hive/router-query-planner';
import { getFragmentsFromDocument } from '@graphql-tools/executor';
import {
  ExecutionRequest,
  getOperationASTFromRequest,
  isAsyncIterable,
  MaybeAsyncIterable,
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
  DocumentNode,
  FragmentDefinitionNode,
  GraphQLError,
  GraphQLNamedType,
  GraphQLSchema,
  OperationDefinitionNode,
  OperationTypeNode,
  SelectionSetNode,
} from 'graphql';
import {
  getNamedType,
  getOperationAST,
  getVariableValues,
  isAbstractType,
  isEnumType,
  isInterfaceType,
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

const operationDocumentCache = new Map<string, DocumentNode>();
const operationRootFieldCache = new Map<string, (string | number)[] | null>();

function createQueryPlanExecutionContext({
  supergraphSchema,
  executionRequest,
  onSubgraphExecute,
}: CreateExecutionContextOpts): QueryPlanExecutionContext {
  const fragments = getFragmentsFromDocument(executionRequest.document);
  const operation = getOperationASTFromRequest(executionRequest);

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
  };
}

type NormalizedFlattenNodePathSegment =
  | { kind: 'Field'; name: string }
  | { kind: 'Cast'; typeCondition: string }
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
    } else if ('Cast' in segment) {
      normalized.push({ kind: 'Cast', typeCondition: segment.Cast });
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
      if (typeof current === 'object' && current !== null) {
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
      if (typeof current === 'object' && current !== null) {
        const candidate = current as EntityRepresentation;
        const typename =
          typeof candidate.__typename === 'string'
            ? candidate.__typename
            : segment.typeCondition;
        if (
          entitySatisfiesTypeCondition(
            supergraphSchema,
            typename,
            segment.typeCondition,
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
  const representationKeyToIndex = new Map<string, number>();

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

  const operationDocument = getOperationDocument(fetchNode.operation);
  const defaultErrorPath =
    state?.errorPath ??
    state?.flatten?.errorPath ??
    getDefaultErrorPath(fetchNode, operationDocument);

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
        operationDocument,
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
          Object.assign(target, mergeDeep([target, entity], false, true, true));
        }
      }
      return;
    }

    Object.assign(
      executionContext.data,
      mergeDeep([executionContext.data, responseData], false, true, true),
    );
    return;
  };

  return handleMaybePromise(
    () =>
      executionContext.onSubgraphExecute(fetchNode.serviceName, {
        document: operationDocument,
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
    operationDocument: DocumentNode;
    defaultPath?: (string | number)[];
  },
): GraphQLError[] {
  if (!errors.length) {
    return [];
  }
  const { fetchNode, state, operationDocument } = options;
  const flattenState = state?.flatten;
  const fallbackPath =
    options.defaultPath ?? getDefaultErrorPath(fetchNode, operationDocument);

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

function getOperationDocument(operation: string): DocumentNode {
  let cached = operationDocumentCache.get(operation);
  if (!cached) {
    cached = parse(operation);
    operationDocumentCache.set(operation, cached);
  }
  return cached;
}

function getOperationCacheKey(
  fetchNode: Extract<PlanNode, { kind: 'Fetch' }>,
): string {
  return `${fetchNode.operationName ?? ''}|${fetchNode.operation}`;
}

function getDefaultErrorPath(
  fetchNode: Extract<PlanNode, { kind: 'Fetch' }>,
  document: DocumentNode,
): (string | number)[] | undefined {
  const cacheKey = getOperationCacheKey(fetchNode);
  const cached = operationRootFieldCache.get(cacheKey);
  if (cached !== undefined) {
    return cached ?? undefined;
  }
  const operationAst = getOperationAST(document, fetchNode.operationName);
  if (!operationAst) {
    operationRootFieldCache.set(cacheKey, null);
    return undefined;
  }
  const rootSelection = operationAst.selectionSet.selections.find(
    (selection) => selection.kind === Kind.FIELD,
  );
  if (!rootSelection) {
    operationRootFieldCache.set(cacheKey, null);
    return undefined;
  }
  const responseKey = rootSelection.alias?.value ?? rootSelection.name.value;
  const path = responseKey ? [responseKey] : undefined;
  operationRootFieldCache.set(cacheKey, path ?? null);
  return path;
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  const type = typeof value;
  if (type === 'number' || type === 'boolean') {
    return JSON.stringify(value);
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
          `${JSON.stringify(key)}:${stableStringify(entryValue)}`,
      );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(null);
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
    return nextData;
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
  typeConditionInInlineFragment: string | undefined,
) {
  if (!typeConditionInInlineFragment) {
    return false; // unknown actually
  }
  if (typeNameInEntity === typeConditionInInlineFragment) {
    return true;
  }
  const conditionType = supergraphSchema.getType(typeConditionInInlineFragment);
  const entityType = supergraphSchema.getType(typeNameInEntity);
  return (
    isObjectType(entityType) &&
    isAbstractType(conditionType) &&
    supergraphSchema.isSubType(conditionType, entityType)
  );
}

/**
 * Helper function for `projectDocumentNode` to iterate over the data with selections
 */
function projectSelectionSet(
  data: any,
  selectionSet: SelectionSetNode,
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
  // Check if the type itself is marked with @inaccessible
  if (isObjectType(parentType)) {
    const inaccessibleDirective = parentType.astNode?.directives?.find(
      (directive) => directive.name.value === 'inaccessible',
    );
    if (inaccessibleDirective) {
      return null;
    }
  }
  const result: Record<string, any> = {};
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
      let projectedValue = selection.selectionSet
        ? projectSelectionSet(
            data[responseKey],
            selection.selectionSet,
            fieldType,
            executionContext,
          )
        : data[responseKey];
      if (projectedValue !== undefined) {
        if (isEnumType(fieldType)) {
          const enumValue = fieldType.getValue(projectedValue);
          if (!enumValue) {
            projectedValue = null;
          } else {
            // Check if the enum value is marked with @inaccessible
            const inaccessibleDirective = enumValue.astNode?.directives?.find(
              (directive) => directive.name.value === 'inaccessible',
            );
            if (inaccessibleDirective) {
              projectedValue = null;
            }
          }
        }
        if (result[responseKey] == null) {
          result[responseKey] = projectedValue;
        } else if (
          typeof result[responseKey] === 'object' &&
          projectedValue != null
        ) {
          result[responseKey] = Object.assign(
            result[responseKey],
            mergeDeep(result[responseKey], projectedValue),
          );
        } else {
          result[responseKey] = projectedValue;
        }
      } else if (field.name === '__typename') {
        result[responseKey] = type.name;
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
        );
        if (projectedValue != null) {
          Object.assign(
            result,
            mergeDeep([result, projectedValue], false, true, true),
          );
        }
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
        );
        if (projectedValue != null) {
          Object.assign(
            result,
            mergeDeep([result, projectedValue], false, true, true),
          );
        }
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
      );
      if (projectedValue != null) {
        Object.assign(
          result,
          mergeDeep([result, projectedValue], false, true, true),
        );
      }
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
