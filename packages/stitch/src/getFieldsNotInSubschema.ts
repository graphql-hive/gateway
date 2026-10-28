import { extractUnavailableFields, getVariableValues, handleOverrideByDelegation, StitchingInfo, Subschema, subtractSelectionSets } from '@graphql-tools/delegate';
import { collectSubFields, memoize3 } from '@graphql-tools/utils';
import { FieldNode, FragmentDefinitionNode, getNamedType, GraphQLCompositeType, GraphQLField, GraphQLObjectType, GraphQLSchema, isAbstractType, isInterfaceType, isObjectType, Kind, SelectionNode, SelectionSetNode, TypeNameMetaFieldDef } from 'graphql';
import { GraphQLResolveInfo } from 'graphql/type';

export function getFieldsNotInSubschema(
  schema: GraphQLSchema,
  stitchingInfo: StitchingInfo,
  gatewayType: GraphQLCompositeType,
  subschemaType: GraphQLCompositeType,
  fieldNodes: FieldNode[],
  fragments: Record<string, FragmentDefinitionNode>,
  variableValues: Record<string, any>,
  subschema: Subschema,
  providedSelectionNode: SelectionSetNode | undefined,
  context: any | undefined,
  info: GraphQLResolveInfo | undefined,
): Array<FieldNode> {
  const sourceSchema = subschema.transformedSchema;
  const normalizedVariableValues = getVariableValues(variableValues);
  // collectSubFields is typed for object parents; for unions/interfaces the
  // abstract branch below expands possible object types.
  let { fields: subFieldNodesByResponseKey } = collectSubFields(
    schema,
    fragments,
    normalizedVariableValues,
    gatewayType as GraphQLObjectType,
    fieldNodes,
  );

  let mapChanged = false;

  // Collect deferred fields
  // delegate them when their resolver runs so the parent can be released

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
      const { fields: subFieldNodesOfPossibleType } = collectSubFields(
        schema,
        fragments,
        normalizedVariableValues,
        possibleType,
        fieldNodes,
      );

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

  // Unions have no fields of their own; treat every selected field as absent
  // so the abstract-type path in the delegation planner can re-fetch via
  // inline fragments on the owning subschema (graphql-tools#4966).
  const fields =
    isObjectType(subschemaType) || isInterfaceType(subschemaType)
      ? subschemaType.getFields()
      : Object.create(null);

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
          // @provides flattening is only meaningful for object parents;
          // unions never carry provided selections themselves.
          gatewayType as GraphQLObjectType,
          schema,
        );
        const subtracted = subtractSelectionSets(
          subFieldSelection,
          flattenedProvided,
          fragments,
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
      const providedTypeFieldPairs = providedSelectionNode
        ? collectProvidedTypeFieldPairs(
            providedSelectionNode,
            gatewayType as GraphQLObjectType,
            schema,
          )
        : null;
      for (const subFieldNode of subFieldNodes) {
        const unavailableFields = extractUnavailableFields(
          sourceSchema,
          field,
          subFieldNode,
          (fieldType, selection) => {
            if (
              stitchingInfo.mergedTypes[fieldType.name]?.resolvers.get(
                subschema,
              )
            ) {
              return false;
            }
            // field is already provided by this subgraph via @provides
            return !providedTypeFieldPairs?.has(
              `${fieldType.name}.${selection.name.value}`,
            );
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
    const onAddMissingRequiredFields = () => {
      if (!addedSubFieldNodes) {
        for (const subFieldNode of subFieldNodes) {
          fieldsNotInSchema.add(subFieldNode);
        }
        addedSubFieldNodes = true;
      }
    };
    if (isComputedField || fieldNotInSchema) {
      if (fieldNodesByFieldForType) {
        const visitedFieldNames = new Set<string>();
        addMissingRequiredFields({
          fieldName,
          fields,
          fieldsNotInSchema,
          visitedFieldNames,
          onAdd: onAddMissingRequiredFields,
          fieldNodesByField: fieldNodesByFieldForType,
        });
      }

      // Function selectionSets are stored in dynamicSelectionSetsByField and applied
      // during visitSelectionSet for direct delegation. Type-merge planning only
      // consulted fieldNodesByField (string selectionSets), so gateway fields with
      // request-time dependencies (e.g. salePrice(country) → priceForCountry(country))
      // never injected those deps into the merge fetch. Evaluate them here against
      // the actual field nodes so arg-forwarding selectionSets participate in the plan.
      const dynamicSelectionSets =
        stitchingInfo?.dynamicSelectionSetsByField?.[gatewayType.name]?.[
          fieldName
        ];
      if (dynamicSelectionSets) {
        for (const subFieldNode of subFieldNodes) {
          for (const dynamicSelectionSetFn of dynamicSelectionSets) {
            const selectionSet = dynamicSelectionSetFn(subFieldNode);
            for (const selection of selectionSet.selections) {
              if (
                selection.kind === Kind.FIELD &&
                selection.name.value !== '__typename' &&
                !fields[selection.name.value]
              ) {
                onAddMissingRequiredFields();
                fieldsNotInSchema.add(selection);
                if (fieldNodesByFieldForType) {
                  addMissingRequiredFields({
                    fieldName: selection.name.value,
                    fields,
                    fieldsNotInSchema,
                    visitedFieldNames: new Set([fieldName]),
                    onAdd: onAddMissingRequiredFields,
                    fieldNodesByField: fieldNodesByFieldForType,
                  });
                }
              }
            }
          }
        }
      }
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

// walks the @provides selection set using the gateway schema to collect all
// "TypeName.fieldName" pairs that the providing subgraph covers. used by
// shouldAdd in extractUnavailableFields to skip re-delegating those fields.
function collectProvidedTypeFieldPairs(
  selectionSet: SelectionSetNode,
  parentType: GraphQLObjectType,
  schema: GraphQLSchema,
): Set<string> {
  const pairs = new Set<string>();
  for (const sel of selectionSet.selections) {
    if (sel.kind === Kind.FIELD) {
      pairs.add(`${parentType.name}.${sel.name.value}`);
      if (sel.selectionSet) {
        const fieldDef = parentType.getFields()[sel.name.value];
        if (fieldDef) {
          const namedType = getNamedType(fieldDef.type);
          if (isObjectType(namedType)) {
            for (const p of collectProvidedTypeFieldPairs(
              sel.selectionSet,
              namedType,
              schema,
            )) {
              pairs.add(p);
            }
          }
        }
      }
    } else if (sel.kind === Kind.INLINE_FRAGMENT && sel.selectionSet) {
      const condType = sel.typeCondition
        ? (schema.getType(
            sel.typeCondition.name.value,
          ) as GraphQLObjectType | null)
        : parentType;
      if (condType && isObjectType(condType)) {
        for (const p of collectProvidedTypeFieldPairs(
          sel.selectionSet,
          condType,
          schema,
        )) {
          pairs.add(p);
        }
      }
    }
  }
  return pairs;
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
