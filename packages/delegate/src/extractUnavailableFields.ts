import {
  getNamedType,
  isAbstractType,
  isInterfaceType,
  isLeafType,
  isObjectType,
  isUnionType,
} from '@graphql-tools/utils';
import {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLNamedOutputType,
  GraphQLObjectType,
  GraphQLSchema,
  Kind,
  SelectionNode,
  SelectionSetNode,
  visit,
} from 'graphql';

export function extractUnavailableFieldsFromSelectionSet(
  schema: GraphQLSchema,
  fieldType: GraphQLNamedOutputType,
  fieldSelectionSet: SelectionSetNode,
  shouldAdd: (
    fieldType: GraphQLObjectType | GraphQLInterfaceType,
    selection: FieldNode,
  ) => boolean,
  fragments: Record<string, FragmentDefinitionNode> = {},
) {
  if (isLeafType(fieldType)) {
    return [];
  }
  if (isUnionType(fieldType)) {
    const unavailableSelections: SelectionNode[] = [];
    for (const type of fieldType.getTypes()) {
      // Exclude other inline fragments
      const fieldSelectionExcluded: SelectionSetNode = {
        ...fieldSelectionSet,
        selections: fieldSelectionSet.selections.filter((selection) =>
          selection.kind === Kind.INLINE_FRAGMENT
            ? selection.typeCondition
              ? selection.typeCondition.name.value === type.name
              : false
            : true,
        ),
      };
      unavailableSelections.push(
        ...extractUnavailableFieldsFromSelectionSet(
          schema,
          type,
          fieldSelectionExcluded,
          shouldAdd,
          fragments,
        ),
      );
    }
    return unavailableSelections;
  }
  const subFields = fieldType.getFields();
  const unavailableSelections: SelectionNode[] = [];
  for (const selection of fieldSelectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.name.value === '__typename') {
        continue;
      }
      const fieldName = selection.name.value;
      const selectionField = subFields[fieldName];
      if (!selectionField) {
        if (shouldAdd(fieldType, selection)) {
          unavailableSelections.push(selection);
        }
      } else {
        const unavailableSubFields = extractUnavailableFields(
          schema,
          selectionField,
          selection,
          shouldAdd,
          fragments,
        );
        if (unavailableSubFields.length) {
          unavailableSelections.push({
            ...selection,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: unavailableSubFields,
            },
          });
        }
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const subFieldName =
        selection.typeCondition?.name.value || fieldType.name;
      const subFieldType =
        (selection.typeCondition &&
          (schema.getType(subFieldName) as GraphQLObjectType)) ||
        fieldType;
      if (
        subFieldName === fieldType.name ||
        ((isObjectType(subFieldType) || isInterfaceType(subFieldType)) &&
          isAbstractType(fieldType) &&
          schema.isSubType(fieldType, subFieldType))
      ) {
        const unavailableFields = extractUnavailableFieldsFromSelectionSet(
          schema,
          subFieldType,
          selection.selectionSet,
          shouldAdd,
          fragments,
        );
        if (unavailableFields.length) {
          unavailableSelections.push({
            ...selection,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: unavailableFields,
            },
          });
        }
      } else if (isObjectType(subFieldType) || isInterfaceType(subFieldType)) {
        for (const subSelection of selection.selectionSet.selections) {
          if (
            subSelection.kind === Kind.FIELD &&
            subSelection.name.value === '__typename'
          ) {
            continue;
          }
          if (shouldAdd(subFieldType, subSelection as FieldNode)) {
            unavailableSelections.push(subSelection);
          }
        }
      }
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragment = fragments[selection.name.value];
      if (fragment) {
        const fragmentUnavailableFields =
          extractUnavailableFieldsFromSelectionSet(
            schema,
            fieldType,
            {
              kind: Kind.SELECTION_SET,
              selections: [
                {
                  kind: Kind.INLINE_FRAGMENT,
                  typeCondition: {
                    kind: Kind.NAMED_TYPE,
                    name: {
                      kind: Kind.NAME,
                      value: fragment.typeCondition.name.value,
                    },
                  },
                  selectionSet: fragment.selectionSet,
                },
              ],
            },
            shouldAdd,
            fragments,
          );
        if (fragmentUnavailableFields.length) {
          unavailableSelections.push(...fragmentUnavailableFields);
        }
      }
    }
  }
  return unavailableSelections;
}

export function extractUnavailableFields(
  schema: GraphQLSchema,
  field: GraphQLField<any, any>,
  fieldNode: FieldNode,
  shouldAdd: (
    fieldType: GraphQLObjectType | GraphQLInterfaceType,
    selection: FieldNode,
  ) => boolean,
  fragments: Record<string, FragmentDefinitionNode> = {},
) {
  if (fieldNode.selectionSet) {
    const fieldType = getNamedType(field.type);
    return extractUnavailableFieldsFromSelectionSet(
      schema,
      fieldType,
      fieldNode.selectionSet,
      shouldAdd,
      fragments,
    );
  }
  return [];
}

function fieldExistsInSelectionSet(
  node: SelectionSetNode,
  path: readonly [segment: string | number, fieldName?: string][],
): boolean {
  let currentNode:
    | ((SelectionSetNode | SelectionNode) & Record<string | number, any>)
    | SelectionNode[]
    | undefined = node;
  const isArrayOfSelectionNodes = (node: unknown): node is SelectionNode[] =>
    Array.isArray(node);

  for (const [segment, fieldName] of path) {
    if (!currentNode) {
      return false;
    }

    if (isArrayOfSelectionNodes(currentNode) && fieldName) {
      currentNode = currentNode.find((selectionNode) => {
        return (<Partial<FieldNode>>selectionNode).name?.value === fieldName;
      });
    } else {
      currentNode = currentNode[segment as any];
    }
  }

  return !!currentNode;
}

function getPathWithFieldNames(
  node: SelectionSetNode,
  path: readonly (string | number)[],
): readonly [segment: string | number, fieldName?: string][] {
  const pathWithFieldNames: [segment: string | number, fieldName?: string][] =
    [];
  let currentNode:
    | ((SelectionSetNode | SelectionNode) & Record<string | number, any>)
    | SelectionNode[] = node;
  const isArrayOfSelectionNodes = (node: unknown): node is SelectionNode[] =>
    Array.isArray(node);

  for (const segment of path) {
    currentNode = currentNode[segment as any];

    if (
      !isArrayOfSelectionNodes(currentNode) &&
      currentNode.kind === Kind.FIELD
    ) {
      pathWithFieldNames.push([segment, currentNode.name.value]);
    } else {
      pathWithFieldNames.push([segment]);
    }
  }

  return pathWithFieldNames;
}

export function subtractSelectionSets(
  selectionSetA: SelectionSetNode,
  selectionSetB: SelectionSetNode,
) {
  return visit(selectionSetA, {
    [Kind.FIELD]: {
      enter(node, _key, _parent, path) {
        if (!node.selectionSet) {
          const pathWithFieldNames = getPathWithFieldNames(selectionSetA, path);
          const fieldExists = fieldExistsInSelectionSet(
            selectionSetB,
            pathWithFieldNames,
          );

          if (fieldExists) {
            return null;
          }
        }
        return undefined;
      },
    },
    [Kind.SELECTION_SET]: {
      leave(node) {
        if (node.selections.length === 0) {
          return null;
        }
        return undefined;
      },
    },
    [Kind.INLINE_FRAGMENT]: {
      leave(node) {
        if (node.selectionSet?.selections.length === 0) {
          return null;
        }
        return undefined;
      },
    },
  });
}
