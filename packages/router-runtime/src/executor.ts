import { documentStringMap } from '@envelop/core';
import type {
  BatchFetchNode,
  ConditionGroup,
  CustomScalarPaths,
  EntityBatchAlias,
  FetchNode,
  FetchNodePathSegment,
  FetchRewrite,
  FlattenNodePathSegment,
  PlanNode,
  ProjectionCondition,
  ProjectionField,
  QueryPlan,
  QueryPlanner,
  RequiresSelection,
} from '@graphql-hive/router-query-planner';
import {
  coerceGetVariableValuesResult,
  ExecutionRequest,
  getOperationASTFromDocument,
  getOperationASTFromRequest,
  MaybeAsyncIterable,
  memoize1,
  relocatedError,
  type ExecutionResult,
} from '@graphql-tools/utils';
import {
  createDeferredPromise,
  handleMaybePromise,
  isPromise,
  type DeferredPromise,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';
import {
  ASTNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  getNamedType,
  getVariableValues,
  GraphQLError,
  GraphQLSchema,
  isInterfaceType,
  isObjectType,
  Kind,
  OperationDefinitionNode,
  OperationTypeNode,
  parse,
  VariableDefinitionNode,
  visit,
} from 'graphql';
import { handleMaybePromiseMaybeAsyncIterable } from './utils';

// TODO: drop after bumping @graphql-hive/router-query-planner to 0.0.56
declare module '@graphql-hive/router-query-planner' {
  /**
   * How the planner plans, like the router's planner options from its config. Every option is
   * off or unlimited when missing.
   */
  interface QueryPlannerOptions {
    /**
     * The most aliases one entity request to a subgraph may carry, like the router's
     * `traffic_shaping.all.max_aliases_per_request`. An integer from 0 to 4294967295, where 0
     * counts as 1. Batch fetches are split to stay within it, and it limits the
     * `maxContextGroups` of fetches with context variables. No limit when missing.
     */
    maxAliasesPerRequest?: number;
    /**
     * `maxAliasesPerRequest` for single subgraphs, by subgraph name, like the router's
     * `traffic_shaping.subgraphs.<name>.max_aliases_per_request`. Wins over
     * `maxAliasesPerRequest` for its subgraph.
     */
    subgraphMaxAliasesPerRequest?: Record<string, number>;
    /**
     * Folds matching object type fragments into an interface fragment even when that interface
     * isn't the field's type, like the router's
     * `query_planner.experimental_abstract_type_folding`. Only the subgraph operations change.
     */
    experimentalAbstractTypeFolding?: boolean;
  }
  interface FetchNode {
    /**
     * The most groups of context values one request of this fetch may carry, at least 1, from the
     * `maxAliasesPerRequest` options. Put up to this many groups in one request, each under its own
     * aliases, and send as many requests as it takes. 1 means one request per group, without
     * aliasing. The planner already checked that the operation can be aliased per group, so the
     * executor doesn't have to. Only on fetches with `contextVariables`, missing on those when there
     * is no limit, so every group goes in one request.
     */
    maxContextGroups?: number;
  }
  interface BatchFetchNode {
    /**
     * Like `FetchNode.maxContextGroups`, only on batches with an alias that has
     * `contextVariables`. A group repeats every alias of the batch, so the limit is
     * `maxAliasesPerRequest` divided by the number of aliases.
     */
    maxContextGroups?: number;
  }
}

export interface QueryPlanExecutionContext {
  /**
   * The public schema of the supergraph
   */
  supergraphSchema: GraphQLSchema;
  /**
   * The type of the operation in the document
   */
  operationType: OperationTypeNode;
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
   * The resolvable keys of every entity type in every subgraph
   */
  entityKeys: EntityKeys;

  /**
   * The member types of every abstract type
   */
  possibleTypes: PossibleTypes;

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

/**
 * The resolvable keys of every entity type, by subgraph name and then by type name. Each key is
 * the list of its top-level fields without `__typename`, so a key of `__typename` alone is empty.
 * It is what `QueryPlanner.entityKeys` gives.
 */
export type EntityKeys = QueryPlanner['entityKeys'];

/**
 * The member types of every abstract type of the public schema, by type name. It is what
 * `QueryPlanner.possibleTypes` gives.
 */
export type PossibleTypes = QueryPlanner['possibleTypes'];

function isEntityRepresentation(obj: any): obj is EntityRepresentation {
  return obj?.__typename != null;
}

/**
 * Whether an object of type `typeName` satisfies the type condition `typeCondition`, it does
 * when it is that type or one of its member types.
 */
function satisfiesTypeCondition(
  possibleTypes: PossibleTypes,
  typeName: string,
  typeCondition: string,
): boolean {
  return (
    typeName === typeCondition ||
    (Object.hasOwn(possibleTypes, typeCondition) &&
      possibleTypes[typeCondition]!.includes(typeName))
  );
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
   * The resolvable keys of every entity type in every subgraph.
   */
  entityKeys: EntityKeys;
  /**
   * The member types of every abstract type.
   */
  possibleTypes: PossibleTypes;
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
  entityKeys,
  possibleTypes,
}: QueryPlanExecutorOptions): MaybePromise<
  MaybeAsyncIterable<ExecutionResult<any>>
> {
  const schedule = getPlanSchedule(queryPlan);
  const executionContext = createQueryPlanExecutionContext({
    supergraphSchema,
    executionRequest,
    onSubgraphExecute,
    entityKeys,
    possibleTypes,
  });
  const subscription = schedule.subscription;
  if (!subscription) {
    return handleMaybePromise(
      () => runFetches(schedule, executionContext, schedule.waits),
      () => toExecutionResult(executionContext, queryPlan),
    );
  }
  // the subscription fetch runs once, every event it brings runs the rest of the plan
  return handleMaybePromiseMaybeAsyncIterable(
    () =>
      executeSubgraphRequest(
        subscription,
        executionContext,
        subscription.document,
        selectFetchVariables(
          executionContext.variableValues,
          subscription.node.variableUsages,
        ),
      ),
    (event: ExecutionResult) => {
      const eventContext = { ...executionContext, data: {}, errors: [] };
      mergeRootFetchResult(subscription, eventContext, event);
      return handleMaybePromise(
        () => runFetches(schedule, eventContext, schedule.eventWaits),
        () => toExecutionResult(eventContext, queryPlan),
      );
    },
    (error) => {
      const eventContext = { ...executionContext, data: {}, errors: [] };
      handleSubgraphExecutionError(
        error,
        eventContext,
        subscription.node.serviceName,
        subscription.errorPath,
      );
      return toExecutionResult(eventContext, queryPlan);
    },
  );
}

function toExecutionResult(
  executionContext: QueryPlanExecutionContext,
  { projection }: QueryPlan,
): ExecutionResult {
  const executionResult = {} as ExecutionResult;
  // nothing fetched without errors means every field was skipped, which is still `data: {}`
  if (
    Object.keys(executionContext.data).length > 0 ||
    !executionContext.errors.length
  ) {
    executionResult.data = projectObject(
      executionContext.data,
      projection.fields,
      projection.rootType,
      executionContext,
      [],
    );
  }
  if (executionContext.errors.length > 0) {
    executionResult.errors = executionContext.errors.map((error) =>
      trimErrorPath(error, projection.fields),
    );
  }
  return executionResult;
}

/**
 * A fetch of the plan, with what it needs at execution that can be worked out once per plan.
 */
type ScheduledFetch = RootFetch | FlattenFetch | ScheduledBatchFetch;

interface RootFetch {
  kind: 'Fetch';
  node: FetchNode;
  document: DocumentNode;
  /** Where an error without a path points to. */
  errorPath: (string | number)[];
}

interface FlattenFetch {
  kind: 'Flatten';
  node: FetchNode;
  document: DocumentNode;
  /** Where an error that can't be pointed to an entity points to. */
  errorPath: (string | number)[];
  target: EntityTarget;
}

interface ScheduledBatchFetch {
  kind: 'BatchFetch';
  node: BatchFetchNode;
  document: DocumentNode;
  aliases: BatchAliasTarget[];
}

/** The entities a fetch or a batch alias sends, and how their representations are made. */
interface EntityTarget {
  /** The flatten paths to the entities, without duplicates. */
  paths: NormalizedFlattenNodePathSegment[][];
  requires: RequiresSelection[];
  inputRewrites: FetchRewrite[] | undefined;
  context: PreparedContext;
}

interface BatchAliasTarget extends EntityTarget {
  alias: EntityBatchAlias;
}

/** The `@fromContext` details of a fetch or a batch alias. */
interface PreparedContext {
  /** The context variables, every context group has its own values for them. */
  names: string[];
  /** Where the value of every variable is read from, in order of preference. */
  sources: ContextSource[][];
  /** Every distinct `parentDepth` of the sources. */
  depths: number[];
}

interface ContextSource {
  /** How many ancestors up from the entity the value is read from. */
  parentDepth: number;
  path: FetchNodePathSegment[];
}

/**
 * When the fetches of a plan run. A fetch starts once every fetch it waits for is done, a fetch
 * that doesn't run or has nothing to send is done right away.
 */
interface PlanSchedule {
  /** The fetches, in the order of the plan. */
  fetches: ScheduledFetch[];
  /** How many fetches each fetch waits for. */
  waits: number[];
  /** The fetches that wait for each fetch. */
  dependents: number[][];
  /**
   * The subscription fetch, which is the first fetch, when the operation is a subscription.
   */
  subscription?: RootFetch;
  /** How many fetches each fetch waits for after the subscription fetch brought an event. */
  eventWaits: number[];
}

/**
 * Works out the schedule of the plan's fetches from their `dependsOn`, once per plan. Fails when a
 * fetch depends on one that doesn't come before it in the plan, so there can be no cycles.
 */
const getPlanSchedule = memoize1(function getPlanSchedule(
  queryPlan: QueryPlan,
): PlanSchedule {
  const fetches: ScheduledFetch[] = [];
  const ids: { completes: number[]; dependsOn: number[] }[] = [];
  let subscription: RootFetch | undefined;
  function collect(node: PlanNode) {
    switch (node.kind) {
      case 'Sequence':
      case 'Parallel':
        node.nodes.forEach(collect);
        return;
      case 'Fetch':
        fetches.push({
          kind: 'Fetch',
          node,
          document: getDocumentNodeOfFetchingNode(node),
          errorPath: getDefaultErrorPath(node),
        });
        ids.push({ completes: [node.id], dependsOn: node.dependsOn });
        return;
      case 'Subscription': {
        if (fetches.length) {
          throw new Error('The subscription fetch must come first in the plan');
        }
        subscription = {
          kind: 'Fetch',
          node: node.primary,
          document: getDocumentNodeOfFetchingNode(node.primary),
          errorPath: getDefaultErrorPath(node.primary),
        };
        fetches.push(subscription);
        ids.push({
          completes: [node.primary.id],
          dependsOn: node.primary.dependsOn,
        });
        return;
      }
      case 'Flatten': {
        if (node.node.kind !== 'Fetch') {
          break;
        }
        const fetchNode = node.node;
        const document = getDocumentNodeOfFetchingNode(fetchNode);
        const path = normalizeFlattenNodePath(node.path);
        const errorPath = path.flatMap((segment) =>
          segment.kind === 'Field' ? [segment.name] : [],
        );
        fetches.push({
          kind: 'Flatten',
          node: fetchNode,
          document,
          errorPath: errorPath.length
            ? errorPath
            : getDefaultErrorPath(fetchNode),
          target: {
            paths: [path],
            requires: fetchNode.requires ?? [],
            inputRewrites: fetchNode.inputRewrites,
            context: prepareContext(fetchNode),
          },
        });
        ids.push({ completes: [fetchNode.id], dependsOn: fetchNode.dependsOn });
        return;
      }
      case 'BatchFetch':
        fetches.push({
          kind: 'BatchFetch',
          node,
          document: getDocumentNodeOfFetchingNode(node),
          aliases: node.entityBatch.aliases.map((alias) => ({
            alias,
            paths: alias.paths.map(normalizeFlattenNodePath),
            requires: alias.requires,
            inputRewrites: alias.inputRewrites,
            context: prepareContext(alias),
          })),
        });
        ids.push({ completes: node.completes, dependsOn: node.dependsOn });
        return;
    }
    throw new Error(`Invalid plan node: ${JSON.stringify(node)}`);
  }
  // the planner leaves the node out when no fetch can ever run, like when every
  // field is under both `@skip(if: $a)` and `@include(if: $a)`
  if (queryPlan.node) {
    collect(queryPlan.node);
  }

  const positionById = new Map<number, number>();
  ids.forEach(({ completes }, index) => {
    for (const id of completes) {
      if (positionById.has(id)) {
        throw new Error(`Multiple fetches have the id ${id}`);
      }
      positionById.set(id, index);
    }
  });
  const waits = fetches.map(() => 0);
  const dependents: number[][] = fetches.map(() => []);
  ids.forEach(({ completes, dependsOn }, index) => {
    // ids merged into one batch are one fetch
    const dependencies = new Set<number>();
    for (const id of dependsOn) {
      const dependency = positionById.get(id);
      if (dependency == null || dependency >= index) {
        throw new Error(
          `Fetch ${completes[0]} depends on fetch ${id} that does not come before it`,
        );
      }
      dependencies.add(dependency);
    }
    waits[index] = dependencies.size;
    for (const dependency of dependencies) {
      dependents[dependency]!.push(index);
    }
  });

  const eventWaits = waits.slice();
  if (subscription) {
    for (const dependent of dependents[0]!) {
      eventWaits[dependent]!--;
    }
    // the subscription fetch itself is done, no event starts it again
    eventWaits[0] = -1;
  }
  return { fetches, waits, dependents, subscription, eventWaits };
});

function prepareContext(
  context: Pick<FetchNode, 'contextVariables' | 'contextRewrites'>,
): PreparedContext {
  const names = [...(context.contextVariables ?? [])];
  for (const rewrite of context.contextRewrites ?? []) {
    if (!names.includes(rewrite.renameKeyTo)) {
      names.push(rewrite.renameKeyTo);
    }
  }
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
  return { names, sources, depths };
}

/**
 * Starts every fetch once the fetches it waits for are done, `waits` says how many each one waits
 * for at first. A fetch with fewer than zero waits never starts. Resolves when every fetch that
 * started is done.
 */
function runFetches(
  schedule: PlanSchedule,
  executionContext: QueryPlanExecutionContext,
  initialWaits: number[],
): MaybePromise<void> {
  const waits = initialWaits.slice();
  let running = 0;
  let deferred: DeferredPromise<void> | undefined;
  let syncError: { error: unknown } | undefined;
  // once the plan failed nothing new starts, the result is thrown away anyway
  let failed = false;
  const fail = (error: unknown) => {
    failed = true;
    if (deferred) {
      deferred.reject(error);
    } else {
      syncError ??= { error };
    }
  };
  const release = (index: number) => {
    for (const dependent of schedule.dependents[index]!) {
      if (--waits[dependent]! === 0) {
        start(dependent);
      }
    }
  };
  const start = (index: number) => {
    if (failed) {
      return;
    }
    let result: MaybePromise<unknown>;
    try {
      result = executeFetch(schedule.fetches[index]!, executionContext);
    } catch (error) {
      return fail(error);
    }
    if (!isPromise(result)) {
      return release(index);
    }
    running++;
    result.then(() => {
      running--;
      if (failed) {
        return;
      }
      release(index);
      if (!running) {
        deferred?.resolve();
      }
    }, fail);
  };
  // picked before any starts, starting one can bring the waits of others to zero
  const ready = waits.flatMap((count, index) => (count === 0 ? [index] : []));
  ready.forEach(start);
  if (syncError) {
    throw syncError.error;
  }
  if (!running) {
    return;
  }
  deferred = createDeferredPromise();
  return deferred.promise;
}

function executeFetch(
  fetch: ScheduledFetch,
  executionContext: QueryPlanExecutionContext,
): MaybePromise<unknown> {
  switch (fetch.kind) {
    case 'Fetch': {
      // the `@include`/`@skip` around the fetch and on its fields decide whether it runs
      if (!shouldRun(fetch.node.runIf, executionContext.variableValues)) {
        return;
      }
      return executeRootFetch(fetch, executionContext);
    }
    case 'Flatten': {
      if (!shouldRun(fetch.node.runIf, executionContext.variableValues)) {
        return;
      }
      // a flattened fetch without requires re-enters a root type, like `query` in
      // `mutation { do { query { x } } }`
      if (!fetch.node.requires) {
        return executeRootFetch(fetch, executionContext);
      }
      const collected = collectEntities(
        executionContext.data,
        fetch.target,
        executionContext,
        executionContext.entityKeys[fetch.node.serviceName],
      );
      if (!collected.entities.length) {
        return;
      }
      return executeFlattenFetch(fetch, executionContext, collected);
    }
    case 'BatchFetch': {
      const batchContext = prepareBatchFetchContext(fetch, executionContext);
      if (!batchContext) {
        return;
      }
      return executeBatchFetch(fetch, executionContext, batchContext);
    }
  }
}

/**
 * Cuts the error path at the first key the client didn't ask for. A subgraph's path can go into a
 * field the gateway fetched for itself, like a `@requires` field or `_entities`, and that key means
 * nothing to the client. The error points at the closest value it asked for then, and an error
 * with no such value has no path.
 */
function trimErrorPath(
  error: GraphQLError,
  rootFields: ProjectionField[],
): GraphQLError {
  const path = error.path;
  // no fields to check against, every path would go
  if (!path?.length || !rootFields.length) {
    return error;
  }
  let fields = rootFields;
  const cut = path.findIndex((segment) => {
    if (typeof segment !== 'string') {
      return false;
    }
    // a response key can have a field per type, their selections all count
    const asked = fields.filter(
      (field) => (field.alias ?? field.name) === segment,
    );
    if (!asked.length) {
      return true;
    }
    fields = asked.flatMap((field) => field.selections ?? []);
    return false;
  });
  if (cut === -1) {
    return error;
  }
  if (cut > 0) {
    return relocatedError(error, path.slice(0, cut));
  }
  return new GraphQLError(error.message, {
    nodes: error.nodes,
    source: error.source,
    positions: error.positions,
    originalError: error,
    extensions: error.extensions,
  });
}

interface CreateExecutionContextOpts {
  supergraphSchema: GraphQLSchema;
  executionRequest: ExecutionRequest;
  entityKeys: EntityKeys;
  possibleTypes: PossibleTypes;
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
  entityKeys,
  possibleTypes,
}: CreateExecutionContextOpts): QueryPlanExecutionContext {
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
    operationType: operation.operation,
    variableValues,
    data: {},
    errors: [],
    entityKeys,
    possibleTypes,
    onSubgraphExecute,
    executionRequest,
  };
}

type NormalizedFlattenNodePathSegment =
  | { kind: 'Field'; name: string }
  | { kind: 'Cast'; typeCondition: string[] }
  | { kind: 'List' };

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

interface BatchAliasPreparedContext extends CollectedEntities {
  alias: BatchAliasTarget;
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

/**
 * Whether a fetch or a batch alias with the given `runIf` runs. It runs when any of the
 * condition groups holds, and always when there is no `runIf`. A group holds when every
 * `includeIf` variable is `true` and no `skipIf` variable is.
 */
function shouldRun(
  runIf: ConditionGroup[] | undefined,
  variableValues: Record<string, any> | undefined,
): boolean {
  return (
    !runIf ||
    runIf.some(
      (group) =>
        (group.includeIf ?? []).every(
          (name) => variableValues?.[name] === true,
        ) &&
        !(group.skipIf ?? []).some((name) => variableValues?.[name] === true),
    )
  );
}

/**
 * Selects the value at `path`, from `index` on, in `value`, keeping the shape of lists along the
 * way. Returns `undefined` when the path doesn't apply to the value.
 */
function selectContextValue(
  value: unknown,
  path: FetchNodePathSegment[],
  index: number,
  possibleTypes: PossibleTypes,
): unknown {
  if (index === path.length || value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(
      (item) => selectContextValue(item, path, index, possibleTypes) ?? null,
    );
  }
  if (typeof value !== 'object') {
    return undefined;
  }
  const segment = path[index]!;
  if (segment === 'Parent') {
    return undefined;
  }
  if ('Key' in segment) {
    if (!Object.hasOwn(value, segment.Key)) {
      return undefined;
    }
    return selectContextValue(
      (value as Record<string, unknown>)[segment.Key],
      path,
      index + 1,
      possibleTypes,
    );
  }
  const typename = (value as Record<string, unknown>)['__typename'];
  if (
    typeof typename !== 'string' ||
    !segment.TypenameEquals.some((typeCondition) =>
      satisfiesTypeCondition(possibleTypes, typename, typeCondition),
    )
  ) {
    return undefined;
  }
  return selectContextValue(value, path, index + 1, possibleTypes);
}

/**
 * Walks every path, collects the entities and deduplicates their representations. The entities
 * are grouped by the values of their context variables, which are read from the entity or its
 * ancestors as the context rewrites describe. Without context variables there is a single group.
 */
function collectEntities(
  data: Record<string, any>,
  { paths, requires, inputRewrites, context }: EntityTarget,
  { possibleTypes }: QueryPlanExecutionContext,
  subgraphKeys: Record<string, string[][]> | undefined,
): CollectedEntities {
  const { names, sources, depths } = context;
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
        const value = selectContextValue(from, source.path, 0, possibleTypes);
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
    const representation = projectRequires(
      requires,
      entity,
      possibleTypes,
      subgraphKeys && Object.hasOwn(subgraphKeys, entity.__typename)
        ? subgraphKeys[entity.__typename]
        : undefined,
    );
    if (!representation) {
      return;
    }
    if (inputRewrites?.length) {
      applyRewrites(representation, inputRewrites, possibleTypes);
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

  for (const path of paths) {
    traverseFlattenPath(
      data,
      path,
      0,
      possibleTypes,
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
 * Calls `callback` for every value at `flattenPath`, from `index` on, along with its path and the
 * objects holding the fields walked to get there (nearest last).
 */
function traverseFlattenPath(
  current: unknown,
  flattenPath: NormalizedFlattenNodePathSegment[],
  index: number,
  possibleTypes: PossibleTypes,
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
  const segment = flattenPath[index];
  if (!segment /* same as index === flattenPath.length */) {
    callback(current, path, ancestors);
    return;
  }
  switch (segment.kind) {
    case 'Field': {
      if (Array.isArray(current)) {
        for (const item of current) {
          traverseFlattenPath(
            item,
            flattenPath,
            index,
            possibleTypes,
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
          flattenPath,
          index + 1,
          possibleTypes,
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
        for (let item = 0; item < current.length; item++) {
          path.push(item);
          traverseFlattenPath(
            current[item],
            flattenPath,
            index + 1,
            possibleTypes,
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
            flattenPath,
            index,
            possibleTypes,
            path,
            ancestors,
            callback,
          );
        }
        return;
      }
      if (typeof current === 'object') {
        // an object without `__typename` satisfies any type condition
        const typename = (current as Record<string, unknown>)['__typename'];
        if (
          typeof typename !== 'string' ||
          segment.typeCondition.some((typeCondition) =>
            satisfiesTypeCondition(possibleTypes, typename, typeCondition),
          )
        ) {
          traverseFlattenPath(
            current,
            flattenPath,
            index + 1,
            possibleTypes,
            path,
            ancestors,
            callback,
          );
        }
      }
    }
  }
}

function prepareBatchFetchContext(
  batchFetch: ScheduledBatchFetch,
  executionContext: QueryPlanExecutionContext,
): BatchPreparedContext | null {
  const byAlias = new Map<string, BatchAliasPreparedContext>();
  // the planner shares a representations variable only between aliases with the same requires,
  // rewrites, context and paths, so they also share the collected entities
  const collectedByVariableName = new Map<string, CollectedEntities>();

  for (const alias of batchFetch.aliases) {
    if (!shouldRun(alias.alias.runIf, executionContext.variableValues)) {
      // an alias that's off collects no entities and sends `[]`, the planner shares a
      // representations variable only between aliases with the same `runIf`
      byAlias.set(alias.alias.alias, {
        groups: [],
        offsets: [0],
        entities: [],
        entityPathsByIndex: new Map(),
        alias,
      });
      continue;
    }
    let collected = collectedByVariableName.get(
      alias.alias.representationsVariableName,
    );
    if (!collected) {
      collected = collectEntities(
        executionContext.data,
        alias,
        executionContext,
        executionContext.entityKeys[batchFetch.node.serviceName],
      );
      collectedByVariableName.set(
        alias.alias.representationsVariableName,
        collected,
      );
    }
    byAlias.set(alias.alias.alias, { ...collected, alias });
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
    for (const name of alias.alias.context.names) {
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
    variables[alias.alias.alias.representationsVariableName] ??=
      alias.groups[wave]?.representations ?? [];
  }
  return variables;
}

/**
 * Merges the entities a request returned into the entities they were collected from.
 */
function mergeEntities(
  returnedEntities: EntityRepresentation[],
  collected: CollectedEntities,
  range: RepresentationRange,
  customScalarPaths: CustomScalarPaths | undefined,
) {
  for (const { entity: target, index } of collected.entities) {
    if (index < range.start || index >= range.end) {
      continue;
    }
    const entity = returnedEntities[index - range.start];
    if (!target || !entity) {
      continue;
    }
    deepMerge(target, entity, customScalarPaths);
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

function executeBatchFetch(
  batchFetch: ScheduledBatchFetch,
  executionContext: QueryPlanExecutionContext,
  batchContext: BatchPreparedContext,
): MaybePromise<any> {
  const batchFetchNode = batchFetch.node;
  const selectedVariables = selectFetchVariables(
    executionContext.variableValues,
    batchFetchNode.variableUsages,
  );

  const { byAlias, waves } = batchContext;
  // every wave repeats all batch aliases, each with its own representations and context values
  const requests = splitContextGroups(
    waves,
    batchFetchNode.maxContextGroups,
    batchFetch.document,
    batchFetch.aliases.flatMap((alias) => [
      ...alias.context.names,
      alias.alias.representationsVariableName,
    ]),
  );

  return waitAll(
    requests.map(({ groups: chunk, aliased }) => {
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
            batchFetch,
            executionContext,
            aliased?.document ?? batchFetch.document,
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
            const aliasData = (responseData as Record<string, any>)[aliasName];
            if (!aliasData) {
              continue;
            }
            const outputRewrites = aliasContext.alias.alias.outputRewrites;
            if (outputRewrites?.length) {
              applyRewrites(
                aliasData,
                outputRewrites,
                executionContext.possibleTypes,
              );
            }
            if (Array.isArray(aliasData)) {
              mergeEntities(
                aliasData,
                aliasContext,
                ranges.get(aliasName)!,
                batchFetchNode.customScalarPaths?.children?.[aliasName],
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

function executeFlattenFetch(
  flattenFetch: FlattenFetch,
  executionContext: QueryPlanExecutionContext,
  collected: CollectedEntities,
): MaybePromise<any> {
  const { node: fetchNode, document, errorPath } = flattenFetch;
  const selectedVariables = selectFetchVariables(
    executionContext.variableValues,
    fetchNode.variableUsages,
  );

  const requests = splitContextGroups(
    collected.groups.flatMap((group, index) =>
      group.representations.length ? [index] : [],
    ),
    fetchNode.maxContextGroups,
    document,
    [...flattenFetch.target.context.names, 'representations'],
  );

  return waitAll(
    requests.map(({ groups: chunk, aliased }) => {
      const range: RepresentationRange = {
        start: collected.offsets[chunk[0]!]!,
        end: collected.offsets[chunk[chunk.length - 1]! + 1]!,
      };
      const variablesForFetch: Record<string, any> = { ...selectedVariables };
      chunk.forEach((groupIndex, group) => {
        const groupVariables = {
          ...collected.groups[groupIndex]!.variables,
          representations: collected.groups[groupIndex]!.representations,
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
            flattenFetch,
            executionContext,
            aliased?.document ?? document,
            variablesForFetch,
          ),
        (fetchResult: ExecutionResult) => {
          if (aliased) {
            const counts = chunk.map(
              (groupIndex) =>
                collected.groups[groupIndex]!.representations.length,
            );
            fetchResult = unaliasContextResult(
              fetchResult,
              aliased.responseKeys,
              aliased.responseKeys.map(() => counts),
            );
          }

          if (fetchResult.errors?.length) {
            executionContext.errors.push(
              ...normalizeFetchErrors(fetchResult.errors, errorPath, {
                collected,
                range,
              }),
            );
          }

          const responseData = fetchResult.data;
          if (fetchNode.outputRewrites && responseData) {
            applyRewrites(
              responseData,
              fetchNode.outputRewrites,
              executionContext.possibleTypes,
            );
          }

          const returnedEntities = responseData?._entities as
            EntityRepresentation[] | undefined;
          if (Array.isArray(returnedEntities)) {
            mergeEntities(
              returnedEntities,
              collected,
              range,
              fetchNode.customScalarPaths?.children?.['_entities'],
            );
          }
          return;
        },
        (error) =>
          handleSubgraphExecutionError(
            error,
            executionContext,
            fetchNode.serviceName,
            errorPath,
          ),
      );
    }),
  );
}

function executeSubgraphRequest(
  fetch: ScheduledFetch,
  executionContext: QueryPlanExecutionContext,
  document: DocumentNode,
  variables: Record<string, any> | undefined,
) {
  return executionContext.onSubgraphExecute(fetch.node.serviceName, {
    document,
    variables,
    operationType:
      (fetch.node.operationKind as OperationTypeNode | undefined) ??
      executionContext.operationType,
    extensions: executionContext.executionRequest.extensions,
    rootValue: executionContext.executionRequest.rootValue,
    context: executionContext.executionRequest.context,
    subgraphName: fetch.node.serviceName,
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

/**
 * Splits the context groups (or batch waves) of a fetch, in order, into requests of at most
 * `maxContextGroups` groups each, like the router does. A request with more than one group sends
 * the operation written out per group by {@link writeContextAliasedDocument}, one that can't be
 * written out goes as one request per group. Without `maxContextGroups` every group goes in one
 * request.
 */
function splitContextGroups(
  groups: number[],
  maxContextGroups: number | undefined,
  document: DocumentNode,
  groupVariables: string[],
): { groups: number[]; aliased: ContextAliasedDocument | null }[] {
  const size = Math.max(1, maxContextGroups ?? groups.length);
  const requests: {
    groups: number[];
    aliased: ContextAliasedDocument | null;
  }[] = [];
  for (let start = 0; start < groups.length; start += size) {
    const chunk = groups.slice(start, start + size);
    const aliased =
      chunk.length > 1
        ? writeContextAliasedDocument(document, groupVariables, chunk.length)
        : null;
    if (aliased || chunk.length === 1) {
      requests.push({ groups: chunk, aliased });
    } else {
      requests.push(
        ...chunk.map((group) => ({ groups: [group], aliased: null })),
      );
    }
  }
  return requests;
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

function executeRootFetch(
  rootFetch: RootFetch | FlattenFetch,
  executionContext: QueryPlanExecutionContext,
): MaybePromise<any> {
  return handleMaybePromiseMaybeAsyncIterable(
    () =>
      executeSubgraphRequest(
        rootFetch,
        executionContext,
        rootFetch.document,
        selectFetchVariables(
          executionContext.variableValues,
          rootFetch.node.variableUsages,
        ),
      ),
    (fetchResult: ExecutionResult) =>
      mergeRootFetchResult(rootFetch, executionContext, fetchResult),
    (error) =>
      handleSubgraphExecutionError(
        error,
        executionContext,
        rootFetch.node.serviceName,
        rootFetch.errorPath,
      ),
  );
}

/**
 * Merges the result of a root fetch into the data. The data of a root type re-entry, a flattened
 * fetch without requires, is merged into every object its flatten path reaches instead.
 */
function mergeRootFetchResult(
  rootFetch: RootFetch | FlattenFetch,
  executionContext: QueryPlanExecutionContext,
  fetchResult: ExecutionResult,
) {
  if (fetchResult.errors?.length) {
    executionContext.errors.push(
      ...normalizeFetchErrors(fetchResult.errors, rootFetch.errorPath),
    );
  }
  const responseData = fetchResult.data;
  if (!responseData) {
    return;
  }
  if (rootFetch.node.outputRewrites) {
    applyRewrites(
      responseData,
      rootFetch.node.outputRewrites,
      executionContext.possibleTypes,
    );
  }
  if (rootFetch.kind === 'Fetch') {
    deepMerge(
      executionContext.data,
      responseData,
      rootFetch.node.customScalarPaths,
    );
    return;
  }
  const targets: object[] = [];
  traverseFlattenPath(
    executionContext.data,
    rootFetch.target.paths[0]!,
    0,
    executionContext.possibleTypes,
    [],
    [],
    (value) => {
      for (const target of Array.isArray(value) ? value : [value]) {
        if (target != null && typeof target === 'object') {
          targets.push(target);
        }
      }
    },
  );
  targets.forEach((target, index) => {
    // every target gets its own copy like in the router, the merge would otherwise share objects
    // between them and a later fetch merging into one would change the others
    deepMerge(
      target,
      index === targets.length - 1
        ? responseData
        : structuredClone(responseData),
      rootFetch.node.customScalarPaths,
    );
  });
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

/**
 * Points the errors of a fetch to where they belong in the response. Errors of an entity fetch
 * go to the entities they are about, and the ones without a path go to `fallbackPath`.
 */
function normalizeFetchErrors(
  errors: readonly GraphQLError[],
  fallbackPath: (string | number)[],
  entities?: {
    collected: CollectedEntities;
    /** The representations the failed request sent */
    range: RepresentationRange;
  },
): GraphQLError[] {
  if (!entities) {
    return errors.map((error) =>
      error.path || !fallbackPath.length
        ? error
        : relocatedError(error, fallbackPath),
    );
  }

  const { collected, range } = entities;
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
        for (const { path, index } of collected.entities) {
          if (index >= range.start && index < range.end) {
            relocated.push(relocatedError(error, path));
          }
        }
        continue;
      }
      if (entityIndexPosition !== -1) {
        const dedupIndex = errorPath[entityIndexPosition + 1];
        if (
          typeof dedupIndex === 'number' &&
          range.start + dedupIndex < range.end
        ) {
          const mappedPaths = collected.entityPathsByIndex.get(
            range.start + dedupIndex,
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

    if (fallbackPath.length) {
      relocated.push(relocatedError(error, fallbackPath));
    } else {
      relocated.push(error);
    }
  }

  return relocated;
}

/**
 * Merges `source` into `target` in place, like the router does, and returns the merged value.
 * Objects merge field by field, lists item by item, a `null` keeps what is there and anything
 * else replaces it. A custom scalar, at a terminal of `customScalarPaths`, is opaque and is
 * replaced as a whole.
 */
function deepMerge(
  target: any,
  source: any,
  customScalarPaths: CustomScalarPaths | undefined,
): any {
  if (source == null || target === source) {
    return target ?? source;
  }
  if (
    customScalarPaths?.terminal ||
    target == null ||
    typeof target !== 'object' ||
    typeof source !== 'object' ||
    Array.isArray(target) !== Array.isArray(source)
  ) {
    return source;
  }
  if (Array.isArray(target)) {
    const length = Math.min(target.length, source.length);
    for (let i = 0; i < length; i++) {
      target[i] = deepMerge(target[i], source[i], customScalarPaths);
    }
    return target;
  }
  for (const key in source) {
    // assigning it would replace the prototype of the target
    if (key === '__proto__') {
      continue;
    }
    target[key] = Object.hasOwn(target, key)
      ? deepMerge(target[key], source[key], customScalarPaths?.children?.[key])
      : source[key];
  }
  return target;
}

/**
 * Applies the rewrites to `value` in place. A rewrite whose path goes through a parent only
 * says where a context value comes from, it leaves the data as it is.
 */
function applyRewrites(
  value: unknown,
  rewrites: FetchRewrite[],
  possibleTypes: PossibleTypes,
) {
  for (const rewrite of rewrites) {
    if ('KeyRenamer' in rewrite) {
      applyRewrite(
        value,
        rewrite.KeyRenamer.path,
        0,
        possibleTypes,
        (object, key) => {
          const renameKeyTo = rewrite.KeyRenamer.renameKeyTo;
          if (key !== renameKeyTo) {
            object[renameKeyTo] = object[key];
            delete object[key];
          }
        },
      );
    } else if ('ValueSetter' in rewrite) {
      applyRewrite(
        value,
        rewrite.ValueSetter.path,
        0,
        possibleTypes,
        (object, key) => {
          object[key] = rewrite.ValueSetter.setValueTo;
        },
      );
    } else {
      throw new Error(
        `Unsupported fetch node rewrite: ${JSON.stringify(rewrite)}`,
      );
    }
  }
}

/**
 * Calls `apply` with every object and key at the end of `path` in `value`, going through lists.
 * An object without `__typename` satisfies any type condition.
 */
function applyRewrite(
  value: unknown,
  path: FetchNodePathSegment[],
  index: number,
  possibleTypes: PossibleTypes,
  apply: (object: Record<string, unknown>, key: string) => void,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      applyRewrite(item, path, index, possibleTypes, apply);
    }
    return;
  }
  const segment = path[index];
  if (
    value == null ||
    typeof value !== 'object' ||
    !segment ||
    segment === 'Parent'
  ) {
    return;
  }
  const object = value as Record<string, unknown>;
  if ('TypenameEquals' in segment) {
    const typename = object['__typename'];
    if (
      typeof typename !== 'string' ||
      segment.TypenameEquals.some((typeCondition) =>
        satisfiesTypeCondition(possibleTypes, typename, typeCondition),
      )
    ) {
      applyRewrite(object, path, index + 1, possibleTypes, apply);
    }
    return;
  }
  if (!Object.hasOwn(object, segment.Key)) {
    return;
  }
  if (index === path.length - 1) {
    apply(object, segment.Key);
  } else {
    applyRewrite(object[segment.Key], path, index + 1, possibleTypes, apply);
  }
}

const getDocumentNodeOfFetchingNode = memoize1(
  function getDocumentNodeOfFetchNode(
    fetchingNode: FetchNode | BatchFetchNode,
  ): DocumentNode {
    const doc = parse(fetchingNode.operation, { noLocation: true });
    // Set this so that `getDocumentString` picks it up from cache
    documentStringMap.set(doc, fetchingNode.operation);
    return doc;
  },
);

/** The response key of the first root field of the fetch, where errors without a path go. */
function getDefaultErrorPath(fetchNode: FetchNode): (string | number)[] {
  const rootSelection = getOperationASTFromDocument(
    getDocumentNodeOfFetchingNode(fetchNode),
  )?.selectionSet.selections.find((selection) => selection.kind === Kind.FIELD);
  return rootSelection
    ? [rootSelection.alias?.value ?? rootSelection.name.value]
    : [];
}

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
 * The type of the value of `fieldName` on `typeName`, for a value without `__typename`.
 */
function getFieldTypeName(
  { supergraphSchema }: QueryPlanExecutionContext,
  typeName: string,
  fieldName: string,
): string {
  const type = supergraphSchema.getType(typeName);
  const field =
    isObjectType(type) || isInterfaceType(type)
      ? type.getFields()[fieldName]
      : undefined;
  if (!field) {
    throw new Error(`Field not found: ${fieldName} on ${typeName}`);
  }
  return getNamedType(field.type).name;
}

/**
 * Shapes `object`, of type `typeName`, into the response as the plan's projection says, see
 * `ResponseProjection` of the query planner for the rules. Returns `null` when a `null` in a
 * non-null field makes the object `null`.
 */
function projectObject(
  object: Record<string, unknown>,
  fields: ProjectionField[],
  typeName: string,
  executionContext: QueryPlanExecutionContext,
  path: (string | number)[],
): Record<string, unknown> | null {
  // null proto because response keys come from client-controlled aliases, `__proto__` would
  // otherwise hit Object.prototype on read and merge attacker data into it
  const result: Record<string, unknown> = Object.create(null);
  for (const field of fields) {
    if (field.parentTypes && !field.parentTypes.includes(typeName)) {
      continue;
    }
    const responseKey = field.alias ?? field.name;
    const value = Object.hasOwn(object, responseKey)
      ? object[responseKey]
      : undefined;
    const failure =
      field.condition &&
      evaluateCondition(
        field.condition,
        field,
        typeName,
        value,
        executionContext,
      );
    if (failure === 'skip') {
      continue;
    }
    let projected: unknown;
    if (failure) {
      // the router adds a "Value is not a valid enum value" error for an invalid enum value,
      // the federation audit expects none
      projected = null;
    } else if (field.typename) {
      projected = typeName;
    } else if (value === undefined) {
      projected = null;
      if (field.nonNull) {
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
              `Cannot return null for non-nullable field ${typeName}.${field.name}.`,
              { path: fieldPath },
            ),
          );
        }
      }
    } else {
      path.push(responseKey);
      projected = projectValue(
        value,
        field,
        typeName,
        0,
        executionContext,
        path,
      );
      path.pop();
    }
    // a `null` in a non-null field makes the parent `null`
    if (projected === null && field.nonNull) {
      return null;
    }
    result[responseKey] = projected;
  }
  return result;
}

/**
 * Projects the value of `field`, or an item of it at list level `depth`.
 */
function projectValue(
  value: unknown,
  field: ProjectionField,
  parentTypeName: string,
  depth: number,
  executionContext: QueryPlanExecutionContext,
  path: (string | number)[],
): unknown {
  if (value == null) {
    return null;
  }
  if (Array.isArray(value)) {
    const itemNonNull = field.itemNonNull?.[depth];
    const items = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      path.push(i);
      const item = projectValue(
        value[i],
        field,
        parentTypeName,
        depth + 1,
        executionContext,
        path,
      );
      path.pop();
      // a `null` in a list of non-null items makes the list `null`
      if (item === null && itemNonNull) {
        return null;
      }
      items[i] = item;
    }
    return items;
  }
  // a field without selections keeps its value, like an object of a custom scalar
  if (!field.selections || typeof value !== 'object') {
    return value;
  }
  const object = value as Record<string, unknown>;
  return projectObject(
    object,
    field.selections,
    typeof object['__typename'] === 'string'
      ? object['__typename']
      : getFieldTypeName(executionContext, parentTypeName, field.name),
    executionContext,
    path,
  );
}

/**
 * Evaluates a projection condition of `field`. Returns how it fails: `skip` leaves the field out,
 * `null` makes it `null`. Returns `undefined` when it holds.
 */
function evaluateCondition(
  condition: ProjectionCondition,
  field: ProjectionField,
  parentTypeName: string,
  value: unknown,
  executionContext: QueryPlanExecutionContext,
): 'skip' | 'null' | undefined {
  const evaluate = (
    condition: ProjectionCondition,
  ): 'skip' | 'null' | undefined => {
    if ('include' in condition) {
      return executionContext.variableValues?.[condition.include] === true
        ? undefined
        : 'skip';
    }
    if ('skip' in condition) {
      return executionContext.variableValues?.[condition.skip] === true
        ? 'skip'
        : undefined;
    }
    if ('parentType' in condition) {
      return condition.parentType.includes(parentTypeName) ? undefined : 'skip';
    }
    if ('fieldType' in condition) {
      const typename = (value as Record<string, unknown> | null)?.[
        '__typename'
      ];
      const fieldTypeName = field.typename
        ? 'String'
        : typeof typename === 'string'
          ? typename
          : getFieldTypeName(executionContext, parentTypeName, field.name);
      return condition.fieldType.includes(fieldTypeName) ? undefined : 'null';
    }
    if ('enumValues' in condition) {
      return typeof value !== 'string' || condition.enumValues.includes(value)
        ? undefined
        : 'null';
    }
    if ('and' in condition) {
      return evaluate(condition.and[0]) ?? evaluate(condition.and[1]);
    }
    // fails like the right one when neither holds
    return evaluate(condition.or[0]) && evaluate(condition.or[1]);
  };
  return evaluate(condition);
}

/**
 * This helper function projects the entity data based on the selections in the requires of Fetch Node,
 * so only the required data is sent to the subgraph. Returns `null` when the entity can't be sent.
 *
 * `typeKeys` are the top-level fields of each resolvable key the entity's type has in the subgraph
 * the representation goes to. When they're known, an entity without a complete key is left out,
 * and a field it misses, like a `@requires` field whose subgraph returned `null` for the entity, is
 * sent as `null`. When they aren't, a field the entity misses is left out of the representation.
 */
function projectRequires(
  requiresSelections: RequiresSelection[],
  entity: EntityRepresentation,
  possibleTypes: PossibleTypes,
  typeKeys: string[][] | undefined,
): EntityRepresentation | null {
  const applied = applyRequires(
    requiresSelections,
    entity,
    possibleTypes,
    !!typeKeys,
  );
  if (
    typeKeys &&
    !typeKeys.some((key) => key.every((field) => applied.found.has(field)))
  ) {
    return null;
  }
  // only an entity found by its `__typename` alone is sent with nothing else, without keys for
  // its type the subgraph is trusted to find it like that
  if (
    !Object.keys(applied.result).length &&
    (!applied.typename ||
      applied.missingField ||
      (typeKeys && !typeKeys.some((key) => !key.length)))
  ) {
    return null;
  }
  return { __typename: entity.__typename, ...applied.result };
}

/**
 * Projects a value inside a representation. An object that misses a selected field is `null`,
 * and so is a list item with nothing to send, to keep its place. Returns `undefined` when there
 * is nothing to send.
 */
function projectRequiresValue(
  requiresSelections: RequiresSelection[] | undefined,
  value: unknown,
  possibleTypes: PossibleTypes,
): unknown {
  if (Array.isArray(value)) {
    return value.map(
      (item) =>
        projectRequiresValue(requiresSelections, item, possibleTypes) ?? null,
    );
  }
  // an object without selections is a scalar, like JSON
  if (
    value == null ||
    typeof value !== 'object' ||
    !requiresSelections?.length
  ) {
    return value;
  }
  const object = value as Record<string, unknown>;
  const applied = applyRequires(
    requiresSelections,
    object,
    possibleTypes,
    false,
  );
  if (applied.missingField) {
    return null;
  }
  const typename = applied.typename ? object['__typename'] : undefined;
  if (typename == null) {
    return Object.keys(applied.result).length ? applied.result : undefined;
  }
  return { __typename: typename, ...applied.result };
}

/** What the requires selections that apply to an object found in it. */
interface AppliedRequires {
  /** The projected fields, without `__typename`. */
  result: Record<string, unknown>;
  /** Whether `__typename` is selected. */
  typename: boolean;
  /** Whether a selected field isn't in the object. */
  missingField: boolean;
  /** The response keys whose field was in the object, `null` included. */
  found: Set<string>;
}

/**
 * Projects the fields of `object` that `requiresSelections` select, following the inline
 * fragments its type satisfies. With `keysKnown`, a field the object misses is `null`.
 */
function applyRequires(
  requiresSelections: RequiresSelection[],
  object: Record<string, unknown>,
  possibleTypes: PossibleTypes,
  keysKnown: boolean,
  applied: AppliedRequires = {
    result: {},
    typename: false,
    missingField: false,
    found: new Set(),
  },
): AppliedRequires {
  for (const requiresSelection of requiresSelections) {
    if (requiresSelection.kind === 'InlineFragment') {
      const typeCondition = requiresSelection.typeCondition;
      const typename =
        typeof object['__typename'] === 'string'
          ? object['__typename']
          : typeCondition;
      // like the router, both directions count for requires
      if (
        satisfiesTypeCondition(possibleTypes, typename, typeCondition) ||
        satisfiesTypeCondition(possibleTypes, typeCondition, typename)
      ) {
        applyRequires(
          requiresSelection.selections,
          object,
          possibleTypes,
          keysKnown,
          applied,
        );
      }
      continue;
    }
    if (requiresSelection.kind !== 'Field') {
      continue;
    }
    const responseKey = requiresSelection.alias ?? requiresSelection.name;
    if (responseKey === '__typename') {
      applied.typename = true;
      continue;
    }
    // only where the fetch wrote it, with `price: _internal_qp_alias_0` whatever sits under
    // `price` is some other field, like the client's own `price(currency: USD)`
    let original = object[requiresSelection.name];
    if (original === undefined) {
      if (!keysKnown) {
        applied.missingField = true;
        continue;
      }
      // a `@requires` field whose subgraph returned `null` for the entity, the subgraph still
      // finds the entity by its complete key
      original = null;
    } else {
      applied.found.add(responseKey);
    }
    const projected = projectRequiresValue(
      requiresSelection.selections,
      original,
      possibleTypes,
    );
    if (projected === undefined) {
      continue;
    }
    const previous = applied.result[responseKey];
    applied.result[responseKey] =
      previous != null && projected != null
        ? deepMerge(previous, projected, undefined)
        : projected;
  }
  return applied;
}
