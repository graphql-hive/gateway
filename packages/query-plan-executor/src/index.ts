import {
  asArray,
  createGraphQLError,
  ExecutionRequest,
  inspect,
  isAsyncIterable,
  isPromise,
  mapAsyncIterator,
  mapMaybePromise,
  MaybeAsyncIterable,
  MaybePromise,
  mergeDeep,
  relocatedError,
} from '@graphql-tools/utils';
import {
  DocumentNode,
  ExecutionResult,
  getNamedType,
  getOperationAST,
  getVariableValues,
  GraphQLNamedOutputType,
  GraphQLSchema,
  isAbstractType,
  isEnumType,
  isInterfaceType,
  isObjectType,
  isOutputType,
  Kind,
  OperationDefinitionNode,
  OperationTypeNode,
  parse,
  SelectionSetNode,
  TypeNameMetaFieldDef,
} from 'graphql';
import {
  EntityRepresentation,
  isEntityRepresentation,
  QueryPlanExecutionContext,
} from './types/execution';
import { PlanNode, QueryPlan, RequiresSelection } from './types/plan-nodes';
import { getOperationsAndFragments } from './utils/getOperationAndFragments';

export interface QueryPlanExecutorOptions {
  /**
   * The AST of the query plan to execute
   */
  queryPlan: QueryPlan;
  /**
   * The document AST node that contains the operation and fragments
   */
  document: DocumentNode;
  /**
   * The operation name to execute
   * Required if the document contains multiple operations
   */
  operationName?: string;

  /**
   * The public schema of the supergraph
   */
  supergraphSchema: GraphQLSchema;
  /**
   * Raw variables parsed from the GraphQL params
   */
  variables?: Record<string, any>;
  /**
   * The factory function that returns an executor for a subgraph
   */
  onSubgraphExecute(
    subgraphName: string,
    executionRequest: ExecutionRequest,
  ): MaybePromise<MaybeAsyncIterable<ExecutionResult>>;

  /**
   * The context object to pass to the executor
   */
  context?: any;
}

export function executeQueryPlan({
  queryPlan,
  document,
  operationName,
  variables,
  onSubgraphExecute,
  supergraphSchema,
  context,
}: QueryPlanExecutorOptions) {
  if (!queryPlan.node) {
    return;
  }
  const executionContext = createQueryPlanExecutionContext({
    supergraphSchema,
    document,
    operationName,
    variables,
    onSubgraphExecute,
    context,
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
  return mapMaybePromise(
    executePlanNode(queryPlan.node, executionContext),
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
   * The document AST node that contains the operation and fragments
   */
  document: DocumentNode;
  /**
   * The operation name to execute
   * Required if the document contains multiple operations
   */
  operationName?: string;

  /**
   * The public schema of the supergraph
   */
  supergraphSchema: GraphQLSchema;
  /**
   * Raw variables parsed from the GraphQL params
   */
  variables?: Record<string, any>;
  /**
   * The factory function that returns an executor for a subgraph
   */
  onSubgraphExecute(
    subgraphName: string,
    executionRequest: ExecutionRequest,
  ): MaybePromise<MaybeAsyncIterable<ExecutionResult>>;

  /**
   * The context object to pass to the executor
   */
  context?: any;
}

const globalEmpty = {};

function createQueryPlanExecutionContext({
  supergraphSchema,
  document,
  operationName,
  variables,
  onSubgraphExecute,
  context,
}: CreateExecutionContextOpts): QueryPlanExecutionContext {
  const { operations, operationCnt, singleOperation, fragments } =
    getOperationsAndFragments(document);
  if (operationCnt === 0) {
    throw createGraphQLError('Must provide an operation.');
  }
  let operation: OperationDefinitionNode;
  if (operationName) {
    // We have an operation name
    operation = operations[operationName];
    if (!operation) {
      // We have an operation name but it doesn't exist in the document
      throw createGraphQLError(`Unknown operation named "${operationName}".`);
    }
  } else if (operationCnt === 1) {
    if (!singleOperation) {
      throw createGraphQLError('Should not happen');
    }
    // We have only one operation and no operation name
    operation = singleOperation;
  } else if (operationCnt > 1) {
    // We have multiple operations and no operation name
    throw createGraphQLError(
      'Must provide operation name if query contains multiple operations.',
    );
  } else {
    throw createGraphQLError('Should not happen');
  }

  let variableValues = variables;
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
    // We know it is there
    operation: operation!,
    fragments,
    variableValues,
    data: {},
    errors: [],
    onSubgraphExecute,
    context,
  };
}

/**
 * Executes the individual plan node
 */
function executePlanNode(
  planNode: PlanNode,
  executionContext: QueryPlanExecutionContext,
  representations?: EntityRepresentation[],
  path?: string[],
): MaybePromise<any> {
  switch (planNode.kind) {
    case 'Sequence': {
      return planNode.nodes.reduce(
        (maybePromise, node) =>
          mapMaybePromise(maybePromise, () =>
            executePlanNode(node, executionContext),
          ),
        null,
      );
    }
    case 'Parallel': {
      const promises: PromiseLike<unknown>[] = [];
      for (const node of planNode.nodes) {
        const maybePromise = executePlanNode(node, executionContext);
        if (isPromise(maybePromise)) {
          promises.push(maybePromise);
        }
      }
      if (promises.length === 1) {
        return promises[0];
      }
      if (promises.length === 0) {
        return;
      }
      return Promise.all(promises);
    }
    case 'Flatten': {
      const representations: any[] = [];
      const flattenNode = planNode;
      function iteratePathOverdata(
        parent: Record<string, any>,
        currentPath: string,
        remainingPaths: string[],
      ): unknown {
        if (currentPath === '@') {
          return asArray(parent).map((currentData) =>
            iteratePathOverdata(
              currentData,
              remainingPaths[0]!,
              remainingPaths.slice(1),
            ),
          );
        } else {
          if (currentPath == null) {
            representations.push(parent);
            return;
          }
          const currentData = parent[currentPath];
          return iteratePathOverdata(
            currentData,
            remainingPaths[0]!,
            remainingPaths.slice(1),
          );
        }
      }
      // TODO: fix fast somewhere else
      flattenNode.path = flattenNode.path.map((p) =>
        // hive router qp has paths in Flatten nodes like `[{ Field: 'friends' }]`
        typeof p === 'string' ? p : p['Field'],
      );
      iteratePathOverdata(
        executionContext.data,
        flattenNode.path[0]!,
        flattenNode.path.slice(1),
      );
      return executePlanNode(
        flattenNode.node,
        executionContext,
        representations,
        flattenNode.path,
      );
    }
    case 'Fetch': {
      const fetchNode = planNode;
      const requires = fetchNode.requires;
      if (requires && representations) {
        representations = representations.filter((entity) =>
          requires.some(
            (requiresNode) =>
              entity &&
              entitySatisfiesTypeCondition(
                executionContext.supergraphSchema,
                entity.__typename,
                requiresNode.typeCondition,
              ),
          ),
        );
      }
      const variablesForFetch: Record<string, any> = {};
      if (representations) {
        variablesForFetch['representations'] = representations
          .map((representation) => {
            if (requires) {
              representation = projectRequires(
                requires,
                representation,
                executionContext.supergraphSchema,
              );
            }
            if (fetchNode.inputRewrites) {
              for (const inputRewrite of fetchNode.inputRewrites) {
                switch (inputRewrite.kind) {
                  case 'ValueSetter': {
                    const rewritten = applyValueSetter(
                      representation,
                      inputRewrite.path,
                      inputRewrite.setValueTo,
                      executionContext.supergraphSchema,
                    );
                    representation = rewritten;
                    break;
                  }
                }
              }
            }
            return representation;
          })
          .filter(Boolean);
      }
      if (fetchNode.variableUsages) {
        for (const variableName of fetchNode.variableUsages) {
          variablesForFetch[variableName] =
            executionContext.variableValues?.[variableName];
        }
      }
      const handleFetchResult = (
        fetchResult: MaybeAsyncIterable<ExecutionResult<any, any>>,
      ): MaybeAsyncIterable<unknown> | void => {
        if (isAsyncIterable(fetchResult)) {
          return mapAsyncIterator(fetchResult, handleFetchResult);
        }

        if (fetchResult.errors) {
          let errors = fetchResult.errors;
          if (!path) {
            const operationAst = getOperationAST(
              fetchNode.operationDocumentNode,
              fetchNode.operationName,
            );
            if (operationAst) {
              const rootSelection = operationAst.selectionSet.selections.find(
                (selection) => selection.kind === 'Field',
              );
              const responseKey =
                rootSelection?.alias?.value || rootSelection?.name.value;
              if (responseKey) {
                path = [responseKey];
              }
            }
          }
          if (path) {
            errors = errors.map((error) => relocatedError(error, path));
          }
          executionContext.errors.push(...errors);
        }
        if (fetchNode.outputRewrites) {
          for (const outputRewrite of fetchNode.outputRewrites) {
            switch (outputRewrite.kind) {
              case 'KeyRenamer': {
                applyKeyRenamer(
                  fetchResult.data,
                  outputRewrite.path,
                  outputRewrite.renameKeyTo,
                  executionContext.supergraphSchema,
                );
                break;
              }
            }
          }
        }
        if (representations && fetchResult.data?._entities) {
          const returnedEntities: EntityRepresentation[] =
            fetchResult.data._entities;
          for (const entityIndex in returnedEntities) {
            const entity = returnedEntities[entityIndex];
            const representation = representations[entityIndex];
            if (representation && entity) {
              Object.assign(
                representation,
                mergeDeep([representation, entity], false, true, true),
              );
            }
          }
        } else {
          Object.assign(
            executionContext.data,
            mergeDeep(
              [executionContext.data, fetchResult.data],
              false,
              true,
              true,
            ),
          );
        }
        return;
      };
      return mapMaybePromise(
        executionContext.onSubgraphExecute(fetchNode.serviceName, {
          // document: fetchNode.operationDocumentNode,
          document: parse(fetchNode.operation),
          variables: variablesForFetch,
          context: executionContext.context,
          operationName: fetchNode.operationName,
          operationType: fetchNode.operationKind as OperationTypeNode,
        }),
        handleFetchResult,
      );
    }
    case 'Condition': {
      const conditionValue =
        executionContext.variableValues?.[planNode.condition];
      if (conditionValue) {
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
      console.error('Invalid plan node:', planNode);
      throw new Error(`Invalid plan node: ${inspect(planNode)}`);
  }
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
  setValueTo: any,
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
 * @param typeConditionInInlineFragment The type condition in the inline fragment (... on Type)
 */
function entitySatisfiesTypeCondition(
  supergraphSchema: GraphQLSchema,
  typeNameInEntity: string,
  typeConditionInInlineFragment: string,
) {
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
  type: GraphQLNamedOutputType,
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
        if (isEnumType(fieldType) && !fieldType.getValue(projectedValue)) {
          projectedValue = null;
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
      if (!isEntityRepresentation(data)) {
        throw new Error('Invalid entity');
      }
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
      case 'Field':
        const fieldName = requiresSelection.name;
        const original = entity[fieldName];
        const projectedValue = requiresSelection.selections
          ? projectRequires(
              requiresSelection.selections,
              original,
              supergraphSchema,
            )
          : original;
        if (projectedValue != null) {
          result[fieldName] = projectedValue;
        }
        break;
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
