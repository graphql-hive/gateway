import { CRITICAL_ERROR } from '@graphql-tools/executor';
import {
  ASTVisitorKeyMap,
  createGraphQLError,
  ExecutionRequest,
  getDefinedRootType,
  implementsAbstractType,
  serializeInputValue,
} from '@graphql-tools/utils';
import {
  ArgumentNode,
  ASTNode,
  DocumentNode,
  FragmentDefinitionNode,
  getNamedType,
  GraphQLField,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLType,
  isAbstractType,
  isCompositeType,
  isInterfaceType,
  isLeafType,
  isNullableType,
  isObjectType,
  isUnionType,
  Kind,
  OperationDefinitionNode,
  SelectionNode,
  SelectionSetNode,
  TypeInfo,
  VariableDefinitionNode,
  visit,
  visitWithTypeInfo,
} from 'graphql';
import { getDocumentMetadata } from './getDocumentMetadata.js';
import { getTypeInfo, getTypeInfoWithType } from './getTypeInfo.js';
import { Subschema } from './Subschema.js';
import { DelegationContext, StitchingInfo } from './types.js';
import {
  createVariableNameGenerator,
  updateArgument,
} from './updateArguments.js';

function finalizeGatewayDocument<TContext>(
  targetSchema: GraphQLSchema,
  fragments: FragmentDefinitionNode[],
  operations: OperationDefinitionNode[],
  onOverlappingAliases: () => void,
  delegationContext: DelegationContext<TContext>,
) {
  let usedVariables: Array<string> = [];
  let usedFragments: Array<string> = [];
  const newOperations: Array<OperationDefinitionNode> = [];
  let newFragments: Array<FragmentDefinitionNode> = [];

  const validFragments: Array<FragmentDefinitionNode> = [];
  const validFragmentsWithType: Record<string, GraphQLNamedType> =
    Object.create(null);
  for (const fragment of fragments) {
    const typeName = fragment.typeCondition.name.value;
    const type = targetSchema.getType(typeName);
    if (type != null) {
      validFragments.push(fragment);
      validFragmentsWithType[fragment.name.value] = type;
    }
  }

  let fragmentSet = Object.create(null);

  for (const operation of operations) {
    const type = getDefinedRootType(targetSchema, operation.operation);

    const {
      selectionSet,
      usedFragments: operationUsedFragments,
      usedVariables: operationUsedVariables,
    } = finalizeSelectionSet(
      targetSchema,
      type,
      validFragmentsWithType,
      operation.selectionSet,
      onOverlappingAliases,
    );

    usedFragments = union(usedFragments, operationUsedFragments);

    const {
      usedVariables: collectedUsedVariables,
      newFragments: collectedNewFragments,
      fragmentSet: collectedFragmentSet,
    } = collectFragmentVariables(
      targetSchema,
      fragmentSet,
      validFragments,
      validFragmentsWithType,
      usedFragments,
      onOverlappingAliases,
    );
    const operationOrFragmentVariables = union(
      operationUsedVariables,
      collectedUsedVariables,
    );
    usedVariables = union(usedVariables, operationOrFragmentVariables);
    newFragments = collectedNewFragments;
    fragmentSet = collectedFragmentSet;

    const variableDefinitions = (operation.variableDefinitions ?? []).filter(
      (variable: VariableDefinitionNode) =>
        operationOrFragmentVariables.indexOf(variable.variable.name.value) !==
        -1,
    );

    // Prevent unnecessary __typename in Subscription
    if (operation.operation === 'subscription') {
      selectionSet.selections = selectionSet.selections.filter(
        (selection: SelectionNode) =>
          selection.kind !== Kind.FIELD ||
          selection.name.value !== '__typename',
      );
    }

    // Do not add the operation if it only asks for __typename
    if (
      selectionSet.selections.length === 1 &&
      selectionSet.selections[0] &&
      selectionSet.selections[0].kind === Kind.FIELD &&
      selectionSet.selections[0].name.value === '__typename'
    ) {
      continue;
    }

    newOperations.push({
      kind: Kind.OPERATION_DEFINITION,
      operation: operation.operation,
      name: operation.name,
      directives: operation.directives,
      variableDefinitions,
      selectionSet,
    });
  }

  if (!newOperations.length) {
    throw createGraphQLError(
      'Failed to create a gateway request. The request must contain at least one operation.',
      {
        extensions: {
          [CRITICAL_ERROR]: true,
        },
      },
    );
  }

  let newDocument: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions: [...newOperations, ...newFragments],
  };

  const stitchingInfo = delegationContext.info?.schema?.extensions?.[
    'stitchingInfo'
  ] as StitchingInfo;
  if (stitchingInfo != null) {
    const typeInfo = getTypeInfo(targetSchema);
    newDocument = visit(
      newDocument,
      visitWithTypeInfo(typeInfo, {
        [Kind.FIELD](fieldNode) {
          const parentType = typeInfo.getParentType();
          if (parentType) {
            const parentTypeName = parentType.name;
            const typeConfig = stitchingInfo?.mergedTypes?.[parentTypeName];
            if (typeConfig) {
              const providedSelectionsByField =
                typeConfig?.providedSelectionsByField?.get(
                  delegationContext.subschema as Subschema,
                );
              if (providedSelectionsByField) {
                const providedSelection =
                  providedSelectionsByField[fieldNode.name.value];
                if (providedSelection) {
                  return {
                    ...fieldNode,
                    selectionSet: {
                      kind: Kind.SELECTION_SET,
                      selections: [
                        ...providedSelection.selections,
                        ...(fieldNode.selectionSet?.selections ?? []),
                      ],
                    },
                  };
                }
              }
            }
          }
          return fieldNode;
        },
      }),
    );
  }

  return {
    usedVariables,
    newDocument,
  };
}

export function finalizeGatewayRequest<TContext>(
  originalRequest: ExecutionRequest,
  delegationContext: DelegationContext<TContext>,
  onOverlappingAliases: () => void,
): ExecutionRequest {
  let { document, variables } = originalRequest;

  let { operations, fragments } = getDocumentMetadata(document);
  const { targetSchema, args } = delegationContext;

  if (args) {
    const requestWithNewVariables = addVariablesToRootFields(
      targetSchema,
      operations,
      args,
    );
    operations = requestWithNewVariables.newOperations;
    variables = Object.assign(
      {},
      variables ?? {},
      requestWithNewVariables.newVariables,
    );
  }

  const { usedVariables, newDocument } = finalizeGatewayDocument(
    targetSchema,
    fragments,
    operations,
    onOverlappingAliases,
    delegationContext,
  );

  const newVariables: Record<string, any> = {};
  if (variables != null) {
    for (const variableName of usedVariables) {
      const variableValue = variables[variableName];
      if (variableValue !== undefined) {
        newVariables[variableName] = variableValue;
      }
    }
  }

  return {
    ...originalRequest,
    document: newDocument,
    variables: newVariables,
  };
}

function isTypeNameField(selection: SelectionNode): boolean {
  return (
    selection.kind === Kind.FIELD &&
    !selection.alias &&
    selection.name.value === '__typename'
  );
}

function filterTypenameFields(selections: readonly SelectionNode[]): {
  hasTypeNameField: boolean;
  selections: SelectionNode[];
} {
  let hasTypeNameField = false;
  const filteredSelections = selections.filter((selection) => {
    if (isTypeNameField(selection)) {
      hasTypeNameField = true;
      return false;
    }
    return true;
  });
  return {
    hasTypeNameField,
    selections: filteredSelections,
  };
}

function addVariablesToRootFields(
  targetSchema: GraphQLSchema,
  operations: Array<OperationDefinitionNode>,
  args: Record<string, any>,
): {
  newOperations: Array<OperationDefinitionNode>;
  newVariables: Record<string, any>;
} {
  const newVariables = Object.create(null);

  const newOperations = operations.map((operation: OperationDefinitionNode) => {
    const variableDefinitionMap: Record<string, VariableDefinitionNode> = (
      operation.variableDefinitions ?? []
    ).reduce(
      (prev, def) => ({
        ...prev,
        [def.variable.name.value]: def,
      }),
      {},
    );

    const type = getDefinedRootType(targetSchema, operation.operation);

    const newSelections: Array<SelectionNode> = [];

    for (const selection of operation.selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        const argumentNodes = selection.arguments ?? [];
        const argumentNodeMap: Record<string, ArgumentNode> =
          argumentNodes.reduce(
            (prev, argument) => ({
              ...prev,
              [argument.name.value]: argument,
            }),
            {},
          );

        const targetField = type.getFields()[selection.name.value];

        // excludes __typename
        if (targetField != null) {
          updateArguments(
            targetField,
            argumentNodeMap,
            variableDefinitionMap,
            newVariables,
            args,
          );
        }

        newSelections.push({
          ...selection,
          arguments: Object.values(argumentNodeMap),
        });
      } else {
        newSelections.push(selection);
      }
    }

    const newSelectionSet: SelectionSetNode = {
      kind: Kind.SELECTION_SET,
      selections: newSelections,
    };

    return {
      ...operation,
      variableDefinitions: Object.values(variableDefinitionMap),
      selectionSet: newSelectionSet,
    };
  });

  return {
    newOperations,
    newVariables,
  };
}

function updateArguments(
  targetField: GraphQLField<any, any>,
  argumentNodeMap: Record<string, ArgumentNode>,
  variableDefinitionMap: Record<string, VariableDefinitionNode>,
  variableValues: Record<string, any>,
  newArgs: Record<string, any>,
): void {
  const generateVariableName = createVariableNameGenerator(
    variableDefinitionMap,
  );

  for (const argument of targetField.args) {
    const argName = argument.name;
    const argType = argument.type;

    if (argName in newArgs) {
      updateArgument(
        argumentNodeMap,
        variableDefinitionMap,
        variableValues,
        argName,
        generateVariableName(argName),
        argType,
        serializeInputValue(argType, newArgs[argName]),
      );
    }
  }
}

function collectFragmentVariables(
  targetSchema: GraphQLSchema,
  fragmentSet: any,
  validFragments: Array<FragmentDefinitionNode>,
  validFragmentsWithType: { [name: string]: GraphQLType },
  usedFragments: Array<string>,
  onOverlappingAliases: () => void,
) {
  let remainingFragments = usedFragments.slice();

  let usedVariables: Array<string> = [];
  const newFragments: Array<FragmentDefinitionNode> = [];

  while (remainingFragments.length !== 0) {
    const nextFragmentName = remainingFragments.pop();
    const fragment = validFragments.find(
      (fr) => fr.name.value === nextFragmentName,
    );
    if (fragment != null) {
      const name = nextFragmentName;
      const typeName = fragment.typeCondition.name.value;
      const type = targetSchema.getType(typeName);
      if (type == null) {
        throw new Error(
          `Fragment reference type "${typeName}", but the type is not contained within the target schema.`,
        );
      }
      const {
        selectionSet,
        usedFragments: fragmentUsedFragments,
        usedVariables: fragmentUsedVariables,
      } = finalizeSelectionSet(
        targetSchema,
        type,
        validFragmentsWithType,
        fragment.selectionSet,
        onOverlappingAliases,
      );
      remainingFragments = union(remainingFragments, fragmentUsedFragments);
      usedVariables = union(usedVariables, fragmentUsedVariables);

      if (name && !(name in fragmentSet)) {
        fragmentSet[name] = true;
        newFragments.push({
          kind: Kind.FRAGMENT_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: name,
          },
          typeCondition: fragment.typeCondition,
          selectionSet,
        });
      }
    }
  }

  return {
    usedVariables,
    newFragments,
    fragmentSet,
  };
}

const filteredSelectionSetVisitorKeys: ASTVisitorKeyMap = {
  SelectionSet: ['selections'],
  Field: ['selectionSet'],
  InlineFragment: ['selectionSet'],
  FragmentDefinition: ['selectionSet'],
};

const variablesVisitorKeys: ASTVisitorKeyMap = {
  SelectionSet: ['selections'],
  Field: ['arguments', 'directives', 'selectionSet'],
  Argument: ['value'],

  InlineFragment: ['directives', 'selectionSet'],
  FragmentSpread: ['directives'],
  FragmentDefinition: ['selectionSet'],

  ObjectValue: ['fields'],
  ObjectField: ['name', 'value'],
  Directive: ['arguments'],
  ListValue: ['values'],
};

function finalizeSelectionSet(
  schema: GraphQLSchema,
  type: GraphQLType,
  validFragments: { [name: string]: GraphQLType },
  selectionSet: SelectionSetNode,
  onOverlappingAliases: () => void,
) {
  const usedFragments: Array<string> = [];
  const usedVariables: Array<string> = [];

  const typeInfo = getTypeInfoWithType(schema, type);
  const seenNonNullableMap = new WeakMap<readonly ASTNode[], Set<string>>();
  const seenNullableMap = new WeakMap<readonly ASTNode[], Set<string>>();

  const filteredSelectionSet = filterSelectionSet(
    schema,
    typeInfo,
    validFragments,
    selectionSet,
    onOverlappingAliases,
    usedFragments,
    seenNonNullableMap,
    seenNullableMap,
  );

  visit(
    filteredSelectionSet,
    {
      [Kind.VARIABLE]: (variableNode) => {
        usedVariables.push(variableNode.name.value);
      },
    },
    // visitorKeys argument usage a la https://github.com/gatsbyjs/gatsby/blob/master/packages/gatsby-source-graphql/src/batching/merge-queries.js
    // empty keys cannot be removed only because of typescript errors
    // will hopefully be fixed in future version of graphql-js to be optional
    variablesVisitorKeys as any,
  );

  return {
    selectionSet: filteredSelectionSet,
    usedFragments,
    usedVariables,
  };
}

function filterSelectionSet(
  schema: GraphQLSchema,
  typeInfo: TypeInfo,
  validFragments: { [name: string]: GraphQLType },
  selectionSet: SelectionSetNode,
  onOverlappingAliases: () => void,
  usedFragments: Array<string>,
  seenNonNullableMap: WeakMap<readonly ASTNode[], Set<string>>,
  seenNullableMap: WeakMap<readonly ASTNode[], Set<string>>,
) {
  return visit(
    selectionSet,
    visitWithTypeInfo(typeInfo, {
      [Kind.FIELD]: {
        enter: (node) => {
          const parentType = typeInfo.getParentType();
          if (isObjectType(parentType) || isInterfaceType(parentType)) {
            const field = typeInfo.getFieldDef();
            if (!field) {
              return null;
            }

            const args = field.args != null ? field.args : [];
            const argsMap = Object.create(null);
            for (const arg of args) {
              argsMap[arg.name] = arg;
            }
            if (node.arguments != null) {
              const newArgs = [];
              for (const arg of node.arguments) {
                if (arg.name.value in argsMap) {
                  newArgs.push(arg);
                }
              }
              if (newArgs.length !== node.arguments.length) {
                return {
                  ...node,
                  arguments: newArgs,
                };
              }
            }
          }
          if (isUnionType(parentType) && typeInfo.getType() == null) {
            const possibleTypeNames: Array<string> = [];
            const fieldName = node.name.value;
            for (const memberType of parentType.getTypes()) {
              const memberFields = memberType.getFields();
              const possibleField = memberFields[fieldName];
              if (possibleField != null) {
                const namedType = getNamedType(possibleField.type);
                // If the field is a leaf type, it cannot have a selection set
                if (
                  node.selectionSet?.selections?.length &&
                  isLeafType(namedType)
                ) {
                  continue;
                }
                // If the field is a composite type, it must have a selection set
                if (
                  !node.selectionSet?.selections?.length &&
                  isCompositeType(namedType)
                ) {
                  continue;
                }
                possibleTypeNames.push(memberType.name);
              }
            }
            if (possibleTypeNames.length > 0) {
              const spreads = possibleTypeNames.map((possibleTypeName) => {
                if (!node.selectionSet?.selections) {
                  // leaf field, no selection set. return as is we're sure it exists
                  return {
                    kind: Kind.INLINE_FRAGMENT,
                    typeCondition: {
                      kind: Kind.NAMED_TYPE,
                      name: {
                        kind: Kind.NAME,
                        value: possibleTypeName,
                      },
                    },
                    selectionSet: {
                      kind: Kind.SELECTION_SET,
                      selections: [node],
                    },
                  };
                }

                // object field with selection set. filter it recursively
                const possibleType = schema.getType(
                  possibleTypeName,
                ) as GraphQLObjectType; // it's an object type because union members must be objects

                const possibleField = possibleType.getFields()[node.name.value];
                if (!possibleField) {
                  // the field does not exist on the possible type, skip the spread altogether
                  return undefined;
                }

                // recursively filter the selection set because abstract types can be nested
                const fieldFilteredSelectionSet = filterSelectionSet(
                  schema,
                  getTypeInfoWithType(schema, possibleField.type),
                  validFragments,
                  node.selectionSet,
                  onOverlappingAliases,
                  usedFragments,
                  seenNonNullableMap,
                  seenNullableMap,
                );

                if (!fieldFilteredSelectionSet.selections.length) {
                  // no selections remain after filtering the field, skip the spread altogether
                  return undefined;
                }

                return {
                  kind: Kind.INLINE_FRAGMENT,
                  typeCondition: {
                    kind: Kind.NAMED_TYPE,
                    name: {
                      kind: Kind.NAME,
                      value: possibleTypeName,
                    },
                  },
                  selectionSet: {
                    kind: Kind.SELECTION_SET,
                    selections: [
                      {
                        ...node,
                        selectionSet: fieldFilteredSelectionSet,
                      },
                    ],
                  },
                };
              });
              const nonEmptySpreads = spreads.filter(Boolean);
              if (!nonEmptySpreads.length) {
                // no spreads remain after filtering, skip the field altogether.
                // this is important to avoid invalid ast nodes causing empty lines
                // in the resulting query
                return undefined;
              }
              return nonEmptySpreads;
            }
          }
          return undefined;
        },
        leave: (node) => {
          const type = typeInfo.getType();
          if (type == null) {
            return null;
          }
          const namedType = getNamedType(type);
          if (schema.getType(namedType.name) == null) {
            return null;
          }

          if (isObjectType(namedType) || isInterfaceType(namedType)) {
            const selections =
              node.selectionSet != null ? node.selectionSet.selections : null;
            if (selections == null || selections.length === 0) {
              return null;
            }
          }
          return undefined;
        },
      },
      [Kind.FRAGMENT_SPREAD]: {
        enter: (node) => {
          if (!(node.name.value in validFragments)) {
            return null;
          }
          const parentType = typeInfo.getParentType();
          const innerType = validFragments[node.name.value];
          if (!implementsAbstractType(schema, parentType, innerType)) {
            return null;
          }

          usedFragments.push(node.name.value);
          return undefined;
        },
      },
      [Kind.SELECTION_SET]: {
        enter: (node, _key, _parent, _path) => {
          const parentType = typeInfo.getParentType();
          const { hasTypeNameField, selections } = filterTypenameFields(
            node.selections,
          );
          if (
            hasTypeNameField ||
            (parentType != null && isAbstractType(parentType))
          ) {
            selections.unshift({
              kind: Kind.FIELD,
              name: {
                kind: Kind.NAME,
                value: '__typename',
              },
            });
          }
          return {
            ...node,
            selections,
          };
        },
      },
      [Kind.INLINE_FRAGMENT]: {
        enter: (node) => {
          if (node.typeCondition != null) {
            const parentType = typeInfo.getParentType();
            const innerType = schema.getType(node.typeCondition.name.value);
            if (
              isUnionType(parentType) &&
              parentType.getTypes().some((t) => t.name === innerType?.name)
            ) {
              return node;
            }
            if (!implementsAbstractType(schema, parentType, innerType)) {
              return null;
            }
          }
          return undefined;
        },
        leave: (selection, _key, parent) => {
          if (!selection.selectionSet?.selections?.length) {
            return null;
          }
          if (Array.isArray(parent)) {
            const selectionTypeName = selection.typeCondition?.name.value;
            if (selectionTypeName) {
              const selectionType = schema.getType(selectionTypeName);
              if (selectionType && 'getFields' in selectionType) {
                const selectionTypeFields = selectionType.getFields();
                let seenNonNullable = seenNonNullableMap.get(parent);
                if (!seenNonNullable) {
                  seenNonNullable = new Set();
                  seenNonNullableMap.set(parent, seenNonNullable);
                }
                let seenNullable = seenNullableMap.get(parent);
                if (!seenNullable) {
                  seenNullable = new Set();
                  seenNullableMap.set(parent, seenNullable);
                }
                selection = {
                  ...selection,
                  selectionSet: {
                    ...selection.selectionSet,
                    selections: selection.selectionSet.selections.map(
                      (subSelection) => {
                        if (subSelection.kind === Kind.FIELD) {
                          const fieldName = subSelection.name.value;
                          if (!subSelection.alias) {
                            const field = selectionTypeFields[fieldName];
                            if (field) {
                              let currentNullable: boolean;
                              if (isNullableType(field.type)) {
                                seenNullable.add(fieldName);
                                currentNullable = true;
                              } else {
                                seenNonNullable.add(fieldName);
                                currentNullable = false;
                              }
                              if (
                                seenNullable.has(fieldName) &&
                                seenNonNullable.has(fieldName)
                              ) {
                                onOverlappingAliases();
                                return {
                                  ...subSelection,
                                  alias: {
                                    kind: Kind.NAME,
                                    value: currentNullable
                                      ? `_nullable_${fieldName}`
                                      : `_nonNullable_${fieldName}`,
                                  },
                                };
                              }
                            }
                          }
                        }
                        return subSelection;
                      },
                    ),
                  },
                };
              }
            }
          }
          // No need __typename in inline fragment
          const { selections } = filterTypenameFields(
            selection.selectionSet.selections,
          );
          if (selections.length === 0) {
            return null;
          }
          return {
            ...selection,
            selectionSet: {
              ...selection.selectionSet,
              selections,
            },
            // @defer is not available for the communication between the gw and subgraph
            directives: selection.directives?.filter?.(
              (directive) => directive.name.value !== 'defer',
            ),
          };
        },
      },
    }),
    // visitorKeys argument usage a la https://github.com/gatsbyjs/gatsby/blob/master/packages/gatsby-source-graphql/src/batching/merge-queries.js
    // empty keys cannot be removed only because of typescript errors
    // will hopefully be fixed in future version of graphql-js to be optional
    filteredSelectionSetVisitorKeys as any,
  );
}

function union(...arrays: Array<Array<string>>): Array<string> {
  const cache: Record<string, boolean> = Object.create(null);
  const result: Array<string> = [];
  for (const array of arrays) {
    for (const item of array) {
      if (!(item in cache)) {
        cache[item] = true;
        result.push(item);
      }
    }
  }
  return result;
}
