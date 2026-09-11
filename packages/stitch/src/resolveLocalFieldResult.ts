import { isExternalObject, StitchingInfo } from '@graphql-tools/delegate';
import { mergeDeep } from '@graphql-tools/utils';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import {
  FragmentDefinitionNode,
  getNamedType,
  GraphQLResolveInfo,
  isAbstractType,
  Kind,
  SelectionNode,
  SelectionSetNode,
} from 'graphql';

// presence-based only: values are not type-checked, a null leaf counts as
// satisfied while a null object with a requested sub-selection does not
function valueSatisfiesSelectionSet(
  value: unknown,
  selectionSet: SelectionSetNode,
): boolean {
  if (Array.isArray(value)) {
    return value.every((item) =>
      valueSatisfiesSelectionSet(item, selectionSet),
    );
  }
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const objectValue = value as Record<string, unknown>;
  return selectionSet.selections.every((selection) => {
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      return valueSatisfiesSelectionSet(value, selection.selectionSet);
    }
    if (selection.kind !== Kind.FIELD) {
      return false;
    }
    const responseKey = selection.alias?.value || selection.name.value;
    return (
      objectValue[responseKey] !== undefined &&
      (selection.selectionSet == null ||
        valueSatisfiesSelectionSet(
          objectValue[responseKey],
          selection.selectionSet,
        ))
    );
  });
}

/**
 * Takes a plain object produced by a local resolver and resolves it through
 * type merging when needed:
 *
 * - If the object already satisfies the requested selection set, it is
 *   returned as-is and no delegation happens. This is the fast path for
 *   resolvers that return complete values.
 * - If requested fields are missing but the object satisfies a merge key of
 *   the return type, only the missing fields are delegated to the owning
 *   subschema. The merge key is only the entry ticket; fields the object
 *   already carries are kept as-is and never fetched from the subschema, and
 *   the merged result keeps merging nested fields through the usual
 *   stitching flow.
 * - Payloads are raw resolver results keyed by literal field name, so
 *   aliased requests are matched by field name and aliased fields already in
 *   the payload are not fetched again. Hydrated results carry only literal
 *   field names; `defaultMergedResolver` falls back to the field name when
 *   the aliased response key is absent, so incoming query aliases resolve
 *   with plain graphql-js semantics.
 * - When merge keys of several subschemas are satisfied, a subschema without
 *   computed field dependencies starts the delegation. Type merging stays
 *   enabled so the stitching planner resolves fields owned by other subschemas.
 * - Fields listed in `providedFields` (fields that have their own resolver on
 *   the stitched schema) are excluded from the required selection, because
 *   they are resolved locally anyway. When the remaining selection is already
 *   satisfied by the object, no delegation happens at all.
 * - Objects that satisfy no merge key, are already external, or are not
 *   objects at all are returned untouched, so missing non-nullable fields
 *   error downstream exactly as they would without this helper.
 */
export function resolveLocalFieldResult<
  TContext extends Record<string, any> = Record<string, any>,
>(
  result: any,
  context: TContext,
  info: GraphQLResolveInfo,
  stitchingInfo = info.schema.extensions?.[
    'stitchingInfo'
  ] as StitchingInfo<TContext>,
  providedFields?: ReadonlySet<string>,
): any {
  if (stitchingInfo == null || result == null) {
    return result;
  }
  return resolveOne(result, context, info, stitchingInfo, providedFields);
}

// selections the value does not cover, so only those get delegated;
// the payload is a raw resolver result keyed by field name (aliases are a
// client-side concern); null composites are missing, null leaves are not
function getMissingSelections(
  value: unknown,
  selections: readonly SelectionNode[],
  fragments: Record<string, FragmentDefinitionNode> = {},
): SelectionNode[] {
  if (value == null || typeof value !== 'object') {
    return [...selections];
  }
  const objectValue = value as Record<string, unknown>;
  const missing: SelectionNode[] = [];
  for (const selection of selections) {
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      const sub = getMissingSelections(
        value,
        selection.selectionSet.selections,
        fragments,
      );
      if (sub.length) {
        missing.push({
          ...selection,
          selectionSet: { kind: Kind.SELECTION_SET, selections: sub },
        });
      }
      continue;
    }
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragment = fragments[selection.name.value];
      if (fragment == null) {
        missing.push(selection);
        continue;
      }
      const sub = getMissingSelections(
        value,
        fragment.selectionSet.selections,
        fragments,
      );
      if (sub.length) {
        missing.push({
          kind: Kind.INLINE_FRAGMENT,
          typeCondition: fragment.typeCondition,
          directives: [
            ...(fragment.directives ?? []),
            ...(selection.directives ?? []),
          ],
          selectionSet: { kind: Kind.SELECTION_SET, selections: sub },
        });
      }
      continue;
    }
    const fieldValue = objectValue[selection.name.value];
    if (
      fieldValue === undefined ||
      (fieldValue === null && selection.selectionSet != null)
    ) {
      missing.push(selection);
      continue;
    }
    if (selection.selectionSet != null) {
      if (Array.isArray(fieldValue)) {
        // ponytail: any incomplete item keeps the whole sub-selection, per-item
        // diffs are not worth it for list payloads
        const anyMissing = fieldValue.some(
          (item) =>
            getMissingSelections(
              item,
              selection.selectionSet!.selections,
              fragments,
            ).length > 0,
        );
        if (anyMissing) {
          missing.push(selection);
        }
      } else {
        const sub = getMissingSelections(
          fieldValue,
          selection.selectionSet.selections,
          fragments,
        );
        if (sub.length) {
          missing.push({
            ...selection,
            selectionSet: { kind: Kind.SELECTION_SET, selections: sub },
          });
        }
      }
    }
  }
  return missing;
}

function resolveOne<TContext extends Record<string, any>>(
  value: unknown,
  context: TContext,
  info: GraphQLResolveInfo,
  stitchingInfo: StitchingInfo<TContext>,
  providedFields?: ReadonlySet<string>,
): any {
  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveOne(item, context, info, stitchingInfo, providedFields),
    );
  }
  if (
    value == null ||
    typeof value !== 'object' ||
    value instanceof Error ||
    isExternalObject(value)
  ) {
    return value;
  }
  const objectValue = value as Record<string, unknown>;
  const returnType = getNamedType(info.returnType);
  const typeName =
    typeof objectValue['__typename'] === 'string'
      ? objectValue['__typename']
      : returnType.name;
  const mergedTypeInfo = stitchingInfo.mergedTypes[typeName];
  if (mergedTypeInfo == null) {
    return value;
  }
  let selections = info.fieldNodes.flatMap(
    (fieldNode) => fieldNode.selectionSet?.selections ?? [],
  );
  if (providedFields?.size) {
    // these fields have their own resolvers on the stitched schema,
    // so they will be resolved locally and are not required from the payload
    selections = selections.filter(
      (selection) =>
        selection.kind !== Kind.FIELD ||
        !providedFields.has(selection.name.value),
    );
  }
  const missingSelections = getMissingSelections(
    value,
    selections,
    info.fragments,
  );
  if (!missingSelections.length) {
    return value;
  }
  const selectionSet: SelectionSetNode = {
    kind: Kind.SELECTION_SET,
    selections: missingSelections,
  };
  const candidates = [...mergedTypeInfo.selectionSets].sort(
    ([a], [b]) =>
      Number(Boolean(a.merge?.[typeName]?.fields)) -
      Number(Boolean(b.merge?.[typeName]?.fields)),
  );
  for (const [subschema, keySelectionSet] of candidates) {
    if (valueSatisfiesSelectionSet(value, keySelectionSet)) {
      const resolver = mergedTypeInfo.resolvers.get(subschema);
      if (resolver != null) {
        if (objectValue['__typename'] == null && !isAbstractType(returnType)) {
          objectValue['__typename'] = typeName;
        }
        return handleMaybePromise(
          () =>
            resolver(
              value,
              context,
              info,
              subschema,
              selectionSet,
              undefined,
              returnType,
              false,
            ),
          // value comes first so the delegation result wins on overlaps, while
          // payload fields outside the delegated selection (like the key) survive;
          // respectNonEnumerableSymbols keeps the external object annotation intact
          (resolved) => mergeDeep([value, resolved], false, false, false, true),
        );
      }
    }
  }
  return value;
}
