import {
  DelegationPlanBuilder,
  extractUnavailableFields,
  extractUnavailableFieldsFromSelectionSet,
  leftOverByDelegationPlan,
  MergedTypeInfo,
  StitchingInfo,
  Subschema,
} from '@graphql-tools/delegate';
import { memoize1, memoize2, memoize3 } from '@graphql-tools/utils';
import {
  FieldNode,
  FragmentDefinitionNode,
  getNamedType,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
  InlineFragmentNode,
  isAbstractType,
  Kind,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';
import { handleOverrideByDelegation } from '../../delegate/src/handleOverrideByDelegation.js';
import { getFieldsNotInSubschema } from './getFieldsNotInSubschema.js';
import { memoize5of7 } from './memoize5of7.js';

function calculateDelegationStage(
  mergedTypeInfo: MergedTypeInfo,
  sourceSubschemas: Array<Subschema>,
  targetSubschemas: Array<Subschema>,
  fieldNodes: Array<FieldNode>,
  fragments: Record<string, FragmentDefinitionNode>,
  context: any | undefined,
  info: GraphQLResolveInfo | undefined,
): {
  delegationMap: Map<Subschema, SelectionSetNode>;
  proxiableSubschemas: Array<Subschema>;
  nonProxiableSubschemas: Array<Subschema>;
  unproxiableFieldNodes: Array<FieldNode>;
} {
  const { selectionSets, fieldSelectionSets, uniqueFields, nonUniqueFields } =
    mergedTypeInfo;

  // 1.  calculate if possible to delegate to given subschema

  const proxiableSubschemas: Array<Subschema> = [];
  const nonProxiableSubschemas: Array<Subschema> = [];

  for (const t of targetSubschemas) {
    const selectionSet = selectionSets.get(t);
    const fieldSelectionSetsMap = fieldSelectionSets.get(t);
    if (
      selectionSet != null &&
      !subschemaTypesContainSelectionSet(
        mergedTypeInfo,
        sourceSubschemas,
        selectionSet,
      )
    ) {
      nonProxiableSubschemas.push(t);
    } else {
      if (
        fieldSelectionSetsMap == null ||
        fieldNodes.every((fieldNode) => {
          const fieldName = fieldNode.name.value;
          const fieldSelectionSet = fieldSelectionSetsMap[fieldName];
          return (
            fieldSelectionSet == null ||
            subschemaTypesContainSelectionSet(
              mergedTypeInfo,
              sourceSubschemas,
              fieldSelectionSet,
            )
          );
        })
      ) {
        proxiableSubschemas.push(t);
      } else {
        nonProxiableSubschemas.push(t);
      }
    }
  }

  const unproxiableFieldNodes: Array<FieldNode> = [];

  // 2. for each selection:

  const delegationMap: Map<Subschema, SelectionSetNode> = new Map();
  let overriddenOverall = false;
  for (const fieldNode of fieldNodes) {
    const fieldName = fieldNode.name.value;
    if (fieldName === '__typename') {
      continue;
    }

    // check dependencies for computed fields are available in the source schemas
    const sourcesWithUnsatisfiedDependencies = sourceSubschemas.filter(
      (s) =>
        fieldSelectionSets.get(s) != null &&
        fieldSelectionSets.get(s)![fieldName] != null &&
        !subschemaTypesContainSelectionSet(
          mergedTypeInfo,
          sourceSubschemas,
          fieldSelectionSets.get(s)![fieldName]!,
        ),
    );
    if (sourcesWithUnsatisfiedDependencies.length === sourceSubschemas.length) {
      unproxiableFieldNodes.push(fieldNode);
      for (const source of sourcesWithUnsatisfiedDependencies) {
        if (!nonProxiableSubschemas.includes(source)) {
          nonProxiableSubschemas.push(source);
        }
      }
      continue;
    }

    // 2a. use uniqueFields map to assign fields to subschema if one of possible subschemas

    const uniqueSubschema = uniqueFields[fieldName];
    if (uniqueSubschema != null) {
      if (!proxiableSubschemas.includes(uniqueSubschema)) {
        unproxiableFieldNodes.push(fieldNode);
        continue;
      }

      const existingSubschema = delegationMap.get(uniqueSubschema)
        ?.selections as SelectionNode[];
      if (existingSubschema != null) {
        existingSubschema.push(fieldNode);
      } else {
        delegationMap.set(uniqueSubschema, {
          kind: Kind.SELECTION_SET,
          selections: [fieldNode],
        });
      }

      continue;
    }

    // 2b. use nonUniqueFields to assign to a possible subschema,
    //     preferring one of the subschemas already targets of delegation
    let nonUniqueSubschemas = nonUniqueFields[fieldNode.name.value];
    if (nonUniqueSubschemas == null) {
      unproxiableFieldNodes.push(fieldNode);
      continue;
    }

    nonUniqueSubschemas = nonUniqueSubschemas.filter((s) =>
      proxiableSubschemas.includes(s),
    );
    if (!nonUniqueSubschemas.length) {
      unproxiableFieldNodes.push(fieldNode);
      continue;
    }

    let existingSubschema = nonUniqueSubschemas.find((s) =>
      delegationMap.has(s),
    );

    let overridden = false;
    for (const nonUniqueSubschema of nonUniqueSubschemas) {
      if (context != null && info != null) {
        const overrideConfig =
          nonUniqueSubschema.merge?.[mergedTypeInfo.typeName]?.fields?.[
            fieldNode.name.value
          ]?.override;
        if (overrideConfig != null) {
          const overriddenBySubschema = handleOverrideByDelegation(
            info,
            context,
            overrideConfig.handle,
          );
          if (overriddenBySubschema) {
            let subschemaSelections = delegationMap.get(nonUniqueSubschema);
            if (subschemaSelections == null) {
              subschemaSelections = {
                kind: Kind.SELECTION_SET,
                selections: [],
              };
              delegationMap.set(nonUniqueSubschema, subschemaSelections);
            }
            (subschemaSelections.selections as SelectionNode[]).push(fieldNode);
            overridden = true;
            break;
          } else {
            existingSubschema = undefined;
            overriddenOverall = true;
          }
        }
      }
    }

    if (existingSubschema != null) {
      if (!overridden) {
        // It is okay we previously explicitly check whether the map has the element.
        (
          delegationMap.get(existingSubschema)!.selections as SelectionNode[]
        ).push(fieldNode);
      }
    } else {
      let bestUniqueSubschema = nonUniqueSubschemas[0];
      let bestScore = Infinity;
      for (const nonUniqueSubschema of nonUniqueSubschemas) {
        const typeInSubschema = nonUniqueSubschema.transformedSchema.getType(
          mergedTypeInfo.typeName,
        ) as GraphQLObjectType;
        const fields = typeInSubschema.getFields();
        const field = fields[fieldNode.name.value];
        if (field != null) {
          if (context != null && info != null) {
            const overrideConfig =
              nonUniqueSubschema.merge?.[mergedTypeInfo.typeName]?.fields?.[
                fieldNode.name.value
              ]?.override;
            if (overrideConfig != null) {
              const overridden = handleOverrideByDelegation(
                info,
                context,
                overrideConfig.handle,
              );
              if (overridden) {
                bestUniqueSubschema = nonUniqueSubschema;
                break;
              } else {
                continue;
              }
            }
          }
          const unavailableFields = extractUnavailableFields(
            nonUniqueSubschema.transformedSchema,
            field,
            fieldNode,
            (fieldType) => {
              if (!nonUniqueSubschema.merge?.[fieldType.name]) {
                let nonUniqueSubschemaSelections =
                  // We have to cast it to `SelectionNode[]` because it is Readonly<SelectionNode[]> and it doesn't allow us to push new elements.
                  delegationMap.get(nonUniqueSubschema)
                    ?.selections as SelectionNode[];
                if (nonUniqueSubschemaSelections == null) {
                  nonUniqueSubschemaSelections = [];
                  delegationMap.set(nonUniqueSubschema, {
                    kind: Kind.SELECTION_SET,
                    selections: nonUniqueSubschemaSelections,
                  });
                }
                nonUniqueSubschemaSelections.push(fieldNode);
                // Ignore unresolvable fields
                return false;
              }
              return true;
            },
          );
          const currentScore = calculateSelectionScore(
            unavailableFields,
            fragments,
          );
          if (currentScore < bestScore) {
            bestScore = currentScore;
            bestUniqueSubschema = nonUniqueSubschema;
          }
        }
      }
      let existingSelections = delegationMap.get(bestUniqueSubschema!);
      if (existingSelections != null) {
        (existingSelections.selections as SelectionNode[]).push(fieldNode);
      } else {
        delegationMap.set(bestUniqueSubschema!, {
          kind: Kind.SELECTION_SET,
          selections: [fieldNode],
        });
      }
    }
  }

  if (delegationMap.size > 1 && !overriddenOverall) {
    optimizeDelegationMap(delegationMap, mergedTypeInfo.typeName, fragments);
  }

  return {
    delegationMap,
    proxiableSubschemas,
    nonProxiableSubschemas,
    unproxiableFieldNodes,
  };
}

export const calculateSelectionScore = memoize2(
  function calculateSelectionScore(
    selections: readonly SelectionNode[],
    fragments: Record<string, FragmentDefinitionNode>,
  ): number {
    let score = 0;
    for (const selectionNode of selections) {
      switch (selectionNode.kind) {
        case Kind.FIELD:
          score++;
          if (selectionNode.selectionSet?.selections) {
            score += calculateSelectionScore(
              selectionNode.selectionSet.selections,
              fragments,
            );
          }
          break;
        case Kind.INLINE_FRAGMENT:
          score += calculateSelectionScore(
            selectionNode.selectionSet.selections,
            fragments,
          );
          break;
        case Kind.FRAGMENT_SPREAD:
          const fragment = fragments?.[selectionNode.name.value];
          if (fragment) {
            score += calculateSelectionScore(
              fragment.selectionSet.selections,
              fragments,
            );
          }
          break;
      }
    }
    return score;
  },
);

function getStitchingInfo(schema: GraphQLSchema): StitchingInfo {
  const stitchingInfo = schema.extensions?.['stitchingInfo'] as
    | StitchingInfo
    | undefined;
  if (!stitchingInfo) {
    throw new Error(`Schema is not a stitched schema.`);
  }
  return stitchingInfo;
}

export function createDelegationPlanBuilder(
  mergedTypeInfo: MergedTypeInfo,
): DelegationPlanBuilder {
  mergedTypeInfo.nonMemoizedDelegationPlanBuilder =
    function delegationPlanBuilder(
      schema: GraphQLSchema,
      sourceSubschema: Subschema<any, any, any, any>,
      variableValues: Record<string, any>,
      fragments: Record<string, FragmentDefinitionNode>,
      fieldNodes: FieldNode[],
      context?: any,
      info?: GraphQLResolveInfo,
    ): Array<Map<Subschema, SelectionSetNode>> {
      const stitchingInfo = getStitchingInfo(schema);
      const targetSubschemas =
        mergedTypeInfo?.targetSubschemas.get(sourceSubschema);
      if (!targetSubschemas || !targetSubschemas.length) {
        return [];
      }

      const typeName = mergedTypeInfo.typeName;
      const typeInSubschema = sourceSubschema.transformedSchema.getType(
        typeName,
      ) as GraphQLObjectType;

      let providedSelectionNode: SelectionSetNode | undefined;

      const parentFieldName = fieldNodes[0]?.name.value;

      if (info?.parentType && parentFieldName) {
        const providedSelectionsByField =
          stitchingInfo.mergedTypes[
            info.parentType.name
          ]?.providedSelectionsByField?.get(sourceSubschema);
        providedSelectionNode = providedSelectionsByField?.[parentFieldName];
      }

      const fieldsNotInSubschema = getFieldsNotInSubschema(
        schema,
        stitchingInfo,
        schema.getType(typeName) as GraphQLObjectType,
        mergedTypeInfo.typeMaps.get(sourceSubschema)?.[
          typeName
        ] as GraphQLObjectType,
        fieldNodes,
        fragments,
        variableValues,
        sourceSubschema,
        providedSelectionNode,
        context,
        info,
      );

      if (!fieldsNotInSubschema.length) {
        return [];
      }

      const delegationMaps: Array<Map<Subschema, SelectionSetNode>> = [];
      let sourceSubschemas = createSubschemas(sourceSubschema);

      let delegationStage = calculateDelegationStage(
        mergedTypeInfo,
        sourceSubschemas,
        targetSubschemas,
        fieldsNotInSubschema,
        fragments,
        context,
        info,
      );
      let { delegationMap } = delegationStage;
      while (delegationMap.size) {
        delegationMaps.push(delegationMap);

        const {
          proxiableSubschemas,
          nonProxiableSubschemas,
          unproxiableFieldNodes,
        } = delegationStage;

        sourceSubschemas = combineSubschemas(
          sourceSubschemas,
          proxiableSubschemas,
        );

        delegationStage = calculateDelegationStage(
          mergedTypeInfo,
          sourceSubschemas,
          nonProxiableSubschemas,
          unproxiableFieldNodes,
          fragments,
          context,
          info,
        );
        delegationMap = delegationStage.delegationMap;
      }
      if (
        isAbstractType(typeInSubschema) &&
        fieldsNotInSubschema.some(
          (fieldNode) => fieldNode.name.value === '__typename',
        )
      ) {
        const inlineFragments: InlineFragmentNode[] = [];
        for (const fieldNode of fieldNodes) {
          if (fieldNode.selectionSet) {
            for (const selection of fieldNode.selectionSet.selections) {
              if (selection.kind === Kind.INLINE_FRAGMENT) {
                inlineFragments.push(selection);
              }
            }
          }
        }
        const implementedSubschemas = targetSubschemas.filter((subschema) => {
          const typeInTargetSubschema =
            mergedTypeInfo.typeMaps.get(subschema)?.[typeName];
          return (
            isAbstractType(typeInTargetSubschema) &&
            subschema.transformedSchema.getPossibleTypes(typeInTargetSubschema)
              .length
          );
        });
        let added = false;
        for (const implementedSubgraphs of implementedSubschemas) {
          for (const delegationMap of delegationMaps) {
            // SelectionNode is not read-only
            const existingSelections = delegationMap.get(implementedSubgraphs)
              ?.selections as SelectionNode[];
            if (existingSelections) {
              existingSelections.push({
                kind: Kind.FIELD,
                name: {
                  kind: Kind.NAME,
                  value: '__typename',
                },
              });
              existingSelections.push(...inlineFragments);
              added = true;
              break;
            }
            if (added) {
              break;
            }
          }
        }
        if (!added) {
          const subschemaWithTypeName = implementedSubschemas[0];
          if (subschemaWithTypeName) {
            const delegationStageToFetchTypeName: Map<
              Subschema,
              SelectionSetNode
            > = new Map();
            delegationStageToFetchTypeName.set(subschemaWithTypeName, {
              kind: Kind.SELECTION_SET,
              selections: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: '__typename',
                  },
                },
                ...inlineFragments,
              ],
            });
            delegationMaps.push(delegationStageToFetchTypeName);
          }
        }
      }
      if (
        delegationStage.unproxiableFieldNodes.length &&
        delegationStage.nonProxiableSubschemas.length
      ) {
        leftOverByDelegationPlan.set(delegationMaps, {
          unproxiableFieldNodes: delegationStage.unproxiableFieldNodes,
          nonProxiableSubschemas: delegationStage.nonProxiableSubschemas,
          missingFieldsParentMap: new Map(),
          missingFieldsParentDeferredMap: new Map(),
        });
      }
      return delegationMaps;
    };
  return memoize5of7(function wrappedDelegationPlanBuilder(
    schema: GraphQLSchema,
    sourceSubschema: Subschema<any, any, any, any>,
    variableValues: Record<string, any>,
    fragments: Record<string, FragmentDefinitionNode>,
    fieldNodes: FieldNode[],
    context?: any,
    info?: GraphQLResolveInfo,
  ) {
    return mergedTypeInfo.nonMemoizedDelegationPlanBuilder(
      schema,
      sourceSubschema,
      variableValues,
      fragments,
      fieldNodes,
      context,
      info,
    );
  });
}

export function optimizeDelegationMap(
  delegationMap: Map<Subschema, SelectionSetNode>,
  typeName: string,
  fragments: Record<string, FragmentDefinitionNode>,
): Map<Subschema, SelectionSetNode> {
  for (const [subschema, selectionSet] of delegationMap) {
    for (const [subschema2, selectionSet2] of delegationMap) {
      if (subschema === subschema2) {
        continue;
      }
      const unavailableFields = extractUnavailableFieldsFromSelectionSet(
        subschema2.transformedSchema,
        // Unfortunately, getType returns GraphQLNamedType, but we already know the type is a GraphQLObjectType, so we can cast it.
        subschema2.transformedSchema.getType(typeName) as GraphQLObjectType,
        selectionSet,
        () => true,
        fragments,
      );
      if (!unavailableFields.length) {
        delegationMap.set(subschema2, {
          kind: Kind.SELECTION_SET,
          selections: [...selectionSet2.selections, ...selectionSet.selections],
        });
        delegationMap.delete(subschema);
      }
    }
  }
  return delegationMap;
}

const createSubschemas = memoize1(function createSubschemas(
  sourceSubschema: Subschema,
): Array<Subschema> {
  return [sourceSubschema];
});

const combineSubschemas = memoize2(function combineSubschemas(
  sourceSubschemas: Array<Subschema>,
  additionalSubschemas: Array<Subschema>,
): Array<Subschema> {
  return sourceSubschemas.concat(additionalSubschemas);
});

const subschemaTypesContainSelectionSet = memoize3(
  function subschemaTypesContainSelectionSet(
    mergedTypeInfo: MergedTypeInfo,
    sourceSubchemas: Array<Subschema>,
    selectionSet: SelectionSetNode,
  ) {
    return typesContainSelectionSet(
      sourceSubchemas.map(
        (sourceSubschema) =>
          sourceSubschema.transformedSchema.getType(
            mergedTypeInfo.typeName,
          ) as GraphQLObjectType,
      ),
      selectionSet,
    );
  },
);

function typesContainSelectionSet(
  types: Array<GraphQLObjectType>,
  selectionSet: SelectionSetNode,
): boolean {
  const fieldMaps = types.map((type) => type.getFields());

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const fields = fieldMaps
        .map((fieldMap) => fieldMap[selection.name.value])
        .filter((field) => field != null);
      if (!fields.length) {
        return false;
      }

      if (selection.selectionSet != null) {
        return typesContainSelectionSet(
          fields.map((field) =>
            getNamedType(field.type),
          ) as Array<GraphQLObjectType>,
          selection.selectionSet,
        );
      }
    } else if (
      selection.kind === Kind.INLINE_FRAGMENT &&
      selection.typeCondition?.name.value === types[0]?.name
    ) {
      return typesContainSelectionSet(types, selection.selectionSet);
    }
  }

  return true;
}
