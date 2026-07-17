import {
  getNamedType,
  GraphQLResolveInfo,
  isAbstractType,
  Kind,
  SelectionSetNode,
} from 'graphql';
import { isExternalObject } from './mergeFields.js';
import { StitchingInfo } from './types.js';

// presence-based only: values are not type-checked, a null leaf counts as
// satisfied while a null object with a requested sub-selection does not
function valueSatisfiesSelectionSet(
  value: any,
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
  return selectionSet.selections.every((selection) => {
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      return valueSatisfiesSelectionSet(value, selection.selectionSet);
    }
    if (selection.kind !== Kind.FIELD) {
      return false;
    }
    const responseKey = selection.alias?.value || selection.name.value;
    return (
      value[responseKey] !== undefined &&
      (selection.selectionSet == null ||
        valueSatisfiesSelectionSet(value[responseKey], selection.selectionSet))
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
 *   the return type, it is delegated to the owning subschema with the full
 *   requested selection set. The merge key is only the entry ticket; the
 *   subschema answer is authoritative for the requested fields, and the
 *   returned external object keeps merging nested fields through the usual
 *   stitching flow.
 * - When merge keys of several subschemas are satisfied, the first match
 *   wins. Any match works because the delegation is pruned to the fields the
 *   chosen subschema provides, and nested merging covers the rest.
 * - Objects that satisfy no merge key, are already external, or are not
 *   objects at all are returned untouched, so missing non-nullable fields
 *   error downstream exactly as they would without this helper.
 */
export function resolveMergedTypeReference<
  TContext extends Record<string, any> = Record<string, any>,
>(
  result: any,
  context: TContext,
  info: GraphQLResolveInfo,
  stitchingInfo = info.schema.extensions?.[
    'stitchingInfo'
  ] as StitchingInfo<TContext>,
): any {
  if (stitchingInfo == null || result == null) {
    return result;
  }
  return resolveOne(result, context, info, stitchingInfo);
}

function resolveOne<TContext extends Record<string, any>>(
  value: any,
  context: TContext,
  info: GraphQLResolveInfo,
  stitchingInfo: StitchingInfo<TContext>,
): any {
  if (Array.isArray(value)) {
    return value.map((item) => resolveOne(item, context, info, stitchingInfo));
  }
  if (
    value == null ||
    typeof value !== 'object' ||
    value instanceof Error ||
    isExternalObject(value)
  ) {
    return value;
  }
  const returnType = getNamedType(info.returnType);
  const typeName: string = value['__typename'] ?? returnType.name;
  const mergedTypeInfo = stitchingInfo.mergedTypes[typeName];
  if (mergedTypeInfo == null) {
    return value;
  }
  const selectionSet: SelectionSetNode = {
    kind: Kind.SELECTION_SET,
    selections: info.fieldNodes.flatMap(
      (fieldNode) => fieldNode.selectionSet?.selections ?? [],
    ),
  };
  if (
    !selectionSet.selections.length ||
    valueSatisfiesSelectionSet(value, selectionSet)
  ) {
    return value;
  }
  for (const [subschema, keySelectionSet] of mergedTypeInfo.selectionSets) {
    if (valueSatisfiesSelectionSet(value, keySelectionSet)) {
      const resolver = mergedTypeInfo.resolvers.get(subschema);
      if (resolver != null) {
        if (value['__typename'] == null && !isAbstractType(returnType)) {
          value['__typename'] = typeName;
        }
        return resolver(
          value,
          context,
          info,
          subschema,
          selectionSet,
          undefined,
          returnType,
        );
      }
    }
  }
  return value;
}
