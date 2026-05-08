import {
  extractUnavailableFields,
  handleOverrideByDelegation,
  StitchingInfo,
  Subschema,
  subtractSelectionSets,
} from '@graphql-tools/delegate';
import { collectSubFields, memoize3 } from '@graphql-tools/utils';
import {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLField,
  GraphQLObjectType,
  GraphQLSchema,
  isAbstractType,
  Kind,
  SelectionNode,
  SelectionSetNode,
  TypeNameMetaFieldDef,
} from 'graphql';
import { GraphQLResolveInfo } from 'graphql/type';

export function getFieldsNotInSubschema(
  schema: GraphQLSchema,
  stitchingInfo: StitchingInfo,
  gatewayType: GraphQLObjectType,
  subschemaType: GraphQLObjectType,
  fieldNodes: FieldNode[],
  fragments: Record<string, FragmentDefinitionNode>,
  variableValues: Record<string, any>,
  subschema: Subschema,
  providedSelectionNode: SelectionSetNode | undefined,
  context: any | undefined,
  info: GraphQLResolveInfo | undefined,
): Array<FieldNode> {
  const sourceSchema = subschema.transformedSchema;
  let { fields: subFieldNodesByResponseKey, patches } = collectSubFields(
    schema,
    fragments,
    variableValues,
    gatewayType,
    fieldNodes,
  );

  let mapChanged = false;

  // Collect deferred fields
  if (patches.length) {
    subFieldNodesByResponseKey = new Map(subFieldNodesByResponseKey);
    for (const patch of patches) {
      for (const [responseKey, fields] of patch.fields) {
        if (!mapChanged) {
          subFieldNodesByResponseKey = new Map(subFieldNodesByResponseKey);
          mapChanged = true;
        }
        const existingSubFieldNodes =
          subFieldNodesByResponseKey.get(responseKey);
        if (existingSubFieldNodes) {
          existingSubFieldNodes.push(...fields);
        } else {
          subFieldNodesByResponseKey.set(responseKey, fields);
        }
      }
    }
  }

  const fieldsNotInSchema = new Set<FieldNode>();
  if (isAbstractType(gatewayType)) {
    fieldsNotInSchema.add({
      kind: Kind.FIELD,
      name: {
        kind: Kind.NAME,
        value: '__typename',
      },
    });
    for (const possibleType of schema.getPossibleTypes(gatewayType)) {
      const { fields: subFieldNodesOfPossibleType, patches } = collectSubFields(
        schema,
        fragments,
        variableValues,
        possibleType,
        fieldNodes,
      );

      for (const patch of patches) {
        for (const [responseKey, fields] of patch.fields) {
          if (!mapChanged) {
            subFieldNodesByResponseKey = new Map(subFieldNodesByResponseKey);
            mapChanged = true;
          }
          const existingSubFieldNodes =
            subFieldNodesByResponseKey.get(responseKey);
          if (existingSubFieldNodes) {
            existingSubFieldNodes.push(...fields);
          } else {
            subFieldNodesByResponseKey.set(responseKey, fields);
          }
        }
      }

      for (const [responseKey, subFieldNodes] of subFieldNodesOfPossibleType) {
        if (!mapChanged) {
          subFieldNodesByResponseKey = new Map(subFieldNodesByResponseKey);
          mapChanged = true;
        }
        const existingSubFieldNodes =
          subFieldNodesByResponseKey.get(responseKey);
        if (existingSubFieldNodes) {
          existingSubFieldNodes.push(...subFieldNodes);
        } else {
          subFieldNodesByResponseKey.set(responseKey, subFieldNodes);
        }
      }
    }
  }

  // TODO: Verify whether it is safe that extensions always exists.
  const fieldNodesByField = stitchingInfo?.fieldNodesByField;

  const fields = subschemaType.getFields();

  const fieldNodesByFieldForType = fieldNodesByField?.[gatewayType.name];

  for (const [, subFieldNodes] of subFieldNodesByResponseKey) {
    let fieldNotInSchema = false;
    const fieldName = subFieldNodes[0]?.name.value!;
    let field =
      fieldName === '__typename' ? TypeNameMetaFieldDef : fields[fieldName];
    if (context != null && info != null) {
      const overrideHandler =
        subschema?.merge?.[gatewayType.name]?.fields?.[fieldName]?.override;
      if (overrideHandler != null) {
        const overridden = handleOverrideByDelegation(
          info,
          context,
          overrideHandler,
        );
        if (!overridden) {
          field = undefined;
        }
      }
    }
    if (!field) {
      if (providedSelectionNode) {
        const subFieldSelection: SelectionSetNode = {
          kind: Kind.SELECTION_SET,
          selections: subFieldNodes,
        };
        // Flatten the @provides selection set so inline fragments matching
        // the gateway type are lifted to the top level. Without this,
        // `@provides(fields: "... on Book { title }")` looks like an
        // inline fragment to `subtractSelectionSets` and the planner ends
        // up still delegating the field to the owner subgraph.
        const flattenedProvided = flattenSelectionsForType(
          providedSelectionNode,
          gatewayType,
          schema,
        );
        const subtracted = subtractSelectionSets(
          subFieldSelection,
          flattenedProvided,
        );
        if (subtracted?.selections?.length) {
          fieldNotInSchema = true;
          for (const subFieldNode of subtracted.selections) {
            fieldsNotInSchema.add(subFieldNode as FieldNode);
          }
        }
      } else {
        fieldNotInSchema = true;
        for (const subFieldNode of subFieldNodes) {
          fieldsNotInSchema.add(subFieldNode);
        }
      }
    } else if (
      // https://github.com/graphql-hive/gateway/pull/1423
      typeof globalThis === 'undefined' ||
      // @ts-expect-error
      !globalThis[
        '__DO_NOT_USE__stitching_disable_extract_unavailable_fields_for_fields_not_in_schema__'
      ]
    ) {
      for (const subFieldNode of subFieldNodes) {
        const unavailableFields = extractUnavailableFields(
          sourceSchema,
          field,
          subFieldNode,
          (fieldType) => {
            if (
              stitchingInfo.mergedTypes[fieldType.name]?.resolvers.get(
                subschema,
              )
            ) {
              return false;
            }
            return true;
          },
          fragments,
        );
        if (unavailableFields.length) {
          fieldNotInSchema = true;
          fieldsNotInSchema.add({
            ...subFieldNode,
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: unavailableFields,
            },
          });
        }
      }
    }
    const isComputedField =
      subschema.merge?.[gatewayType.name]?.fields?.[fieldName]?.computed;
    let addedSubFieldNodes = false;
    if ((isComputedField || fieldNotInSchema) && fieldNodesByFieldForType) {
      const visitedFieldNames = new Set<string>();
      addMissingRequiredFields({
        fieldName,
        fields,
        fieldsNotInSchema,
        visitedFieldNames,
        onAdd: () => {
          if (!addedSubFieldNodes) {
            for (const subFieldNode of subFieldNodes) {
              fieldsNotInSchema.add(subFieldNode);
            }
            addedSubFieldNodes = true;
          }
        },
        fieldNodesByField: fieldNodesByFieldForType,
      });
    }
  }
  return Array.from(fieldsNotInSchema);
}

function addMissingRequiredFields({
  fieldName,
  fields,
  fieldsNotInSchema,
  onAdd,
  fieldNodesByField,
  visitedFieldNames,
}: {
  fieldName: string;
  fields: Record<string, GraphQLField<any, any>>;
  fieldsNotInSchema: Set<FieldNode>;
  onAdd: VoidFunction;
  fieldNodesByField: Record<string, FieldNode[]>;
  visitedFieldNames: Set<string>;
}) {
  if (visitedFieldNames.has(fieldName)) {
    return;
  }
  visitedFieldNames.add(fieldName);
  const fieldNodesForField = fieldNodesByField?.[fieldName];
  if (fieldNodesForField) {
    for (const fieldNode of fieldNodesForField) {
      if (
        fieldNode.name.value !== '__typename' &&
        !fields[fieldNode.name.value]
      ) {
        onAdd();
        fieldsNotInSchema.add(fieldNode);
        addMissingRequiredFields({
          fieldName: fieldNode.name.value,
          fields,
          fieldsNotInSchema,
          onAdd,
          fieldNodesByField,
          visitedFieldNames,
        });
      }
    }
  }
}

// Flatten inline fragments (and matching fragment spreads) inside a
// `@provides` selection set so that field-level subtraction can recognise
// fields that were declared inside `... on TypeName { ... }`.
//
// The result is type-specific: when the planner is evaluating fields for a
// concrete `gatewayType`, only inline fragments whose type condition is
// compatible with that type are lifted up. Other inline fragments are
// preserved as-is so that the same provided selection set can still be used
// for other concrete types that go through the same merged-type resolver.
const flattenSelectionsForTypeImpl = (
  selectionSet: SelectionSetNode,
  gatewayType: GraphQLObjectType,
  schema: GraphQLSchema,
): SelectionSetNode => {
  let changed = false;
  const flat: SelectionNode[] = [];
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      const condName = selection.typeCondition?.name.value;
      const condType = condName ? schema.getType(condName) : gatewayType;
      const matchesGatewayType =
        condType != null &&
        (condType.name === gatewayType.name ||
          (isAbstractType(condType) &&
            schema.isSubType(condType, gatewayType)));
      if (matchesGatewayType) {
        changed = true;
        const inner = flattenSelectionsForType(
          selection.selectionSet,
          gatewayType,
          schema,
        );
        for (const innerSel of inner.selections) {
          flat.push(innerSel);
        }
        continue;
      }
    }
    flat.push(selection);
  }
  if (!changed) {
    return selectionSet;
  }
  return {
    kind: Kind.SELECTION_SET,
    selections: flat,
  };
};

const flattenSelectionsForType = memoize3(flattenSelectionsForTypeImpl);
