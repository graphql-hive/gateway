import { CRITICAL_ERROR } from '@graphql-tools/executor';
import {
  ASTVisitorKeyMap,
  createGraphQLError,
  ExecutionRequest,
  getDefinedRootType,
  implementsAbstractType,
} from '@graphql-tools/utils';
import {
  ASTNode,
  DocumentNode,
  FragmentDefinitionNode,
  getNamedType,
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
import { handleOverrideByDelegation } from './handleOverrideByDelegation.js';
import { Subschema } from './Subschema.js';
import { DelegationContext, StitchingInfo } from './types.js';

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
  let selectionCnt = 0;

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
      delegationContext,
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
      delegationContext,
    );
    const operationOrFragmentVariables = union(
      operationUsedVariables,
      collectedUsedVariables,
    );
    usedVariables = union(usedVariables, operationOrFragmentVariables);
    newFragments = collectedNewFragments;
    fragmentSet = collectedFragmentSet;

    const variableDefinitions: VariableDefinitionNode[] = [];

    for (const variableName of operationOrFragmentVariables) {
      const variableDef = operation.variableDefinitions?.find(
        (varDef) => varDef.variable.name.value === variableName,
      );
      if (variableDef != null) {
        variableDefinitions.push(variableDef);
      } else {
        const variableDef =
          delegationContext.info?.operation.variableDefinitions?.find(
            (varDef) => varDef.variable.name.value === variableName,
          );
        if (variableDef != null) {
          variableDefinitions.push(variableDef);
        }
      }
    }

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

    selectionCnt += selectionSet.selections.length;

    newOperations.push({
      kind: Kind.OPERATION_DEFINITION,
      operation: operation.operation,
      name: operation.name,
      directives: operation.directives,
      variableDefinitions,
      selectionSet,
    });
  }

  if (!newOperations.length || selectionCnt === 0) {
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
  let { operations, fragments } = getDocumentMetadata(originalRequest.document);
  const { targetSchema } = delegationContext;

  const { usedVariables, newDocument } = finalizeGatewayDocument(
    targetSchema,
    fragments,
    operations,
    onOverlappingAliases,
    delegationContext,
  );

  const newVariables: Record<string, any> = {};
  const outerVariables = delegationContext.info?.variableValues;

  for (const varName of usedVariables) {
    const existingVar = originalRequest.variables?.[varName];
    const outerVar = outerVariables?.[varName];
    if (existingVar != null) {
      newVariables[varName] = existingVar;
    } else if (outerVar != null) {
      newVariables[varName] = outerVar;
    }
    if (existingVar === null || outerVar === null) {
      newVariables[varName] = null;
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

function collectFragmentVariables(
  targetSchema: GraphQLSchema,
  fragmentSet: any,
  validFragments: Array<FragmentDefinitionNode>,
  validFragmentsWithType: { [name: string]: GraphQLType },
  usedFragments: Array<string>,
  onOverlappingAliases: () => void,
  delegationContext: DelegationContext<any>,
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
        delegationContext,
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
  delegationContext: DelegationContext<any>,
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
    delegationContext,
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
  delegationContext: DelegationContext<any>,
) {
  return visit(
    selectionSet,
    visitWithTypeInfo(typeInfo, {
      [Kind.FIELD]: {
        enter: (node) => {
          const parentType = typeInfo.getParentType();
          const field = typeInfo.getFieldDef();
          if (
            delegationContext.context != null &&
            delegationContext.info != null &&
            parentType != null &&
            field != null
          ) {
            const parentTypeName = parentType.name;
            const overrideHandler =
              delegationContext.subschemaConfig?.merge?.[parentTypeName]
                ?.fields?.[field.name]?.override;
            if (overrideHandler != null) {
              const overridden = handleOverrideByDelegation(
                delegationContext.info,
                delegationContext.context,
                overrideHandler,
              );
              if (!overridden) {
                return null;
              }
            }
          }
          if (isObjectType(parentType) || isInterfaceType(parentType)) {
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
                  delegationContext,
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
