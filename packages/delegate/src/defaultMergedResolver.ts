import {
  createDeferredPromise,
  handleMaybePromise,
  isPromise,
} from '@whatwg-node/promise-helpers';
import {
  defaultFieldResolver,
  FieldNode,
  getNamedType,
  GraphQLResolveInfo,
  GraphQLSchema,
  isObjectType,
  Kind,
  responsePathAsArray,
  SelectionSetNode,
} from 'graphql';
import { getCoercedVariableValues } from './getCoercedVariableValues.js';
import { getReceiver } from './IncrementalReceiver.js';
import {
  DelegationPlanLeftOver,
  getPlanLeftOverFromParent,
} from './leftOver.js';
import {
  annotateExternalObject,
  EMPTY_OBJECT,
  getActualFieldNodes,
  getSubschema,
  getUnpathedErrors,
  handleResolverResult,
  isExternalObject,
  mergeFields,
} from './mergeFields.js';
import { resolveExternalValue } from './resolveExternalValue.js';
import {
  getHoistedFieldTarget,
  getHoistedSourceType,
  getHoistFieldMeta,
  resolveSourceFieldName,
} from './resolveSourceFieldName.js';
import { Subschema } from './Subschema.js';
import {
  FIELD_SUBSCHEMA_MAP_SYMBOL,
  OBJECT_SUBSCHEMA_SYMBOL,
  UNPATHED_ERRORS_SYMBOL,
} from './symbols.js';
import {
  ExternalObject,
  MergedTypeInfo,
  MergedTypeResolver,
  StitchingInfo,
  SubschemaConfig,
} from './types.js';

/**
 * True when the parent does not yet have a usable value for `responseKey`.
 * `undefined` own-properties (e.g. from visitResult materializing deferred
 * selections before they arrive) are treated as missing.
 */
function isMissingFieldValue(
  parent: Record<string, any>,
  responseKey: string,
): boolean {
  return (
    !Object.prototype.hasOwnProperty.call(parent, responseKey) ||
    parent[responseKey] === undefined
  );
}

function fieldHasStreamDirective(info: GraphQLResolveInfo): boolean {
  for (const fieldNode of info.fieldNodes) {
    const directives = fieldNode.directives;
    if (directives == null) {
      continue;
    }
    for (let i = 0; i < directives.length; i++) {
      if (directives[i]!.name.value === 'stream') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolver that knows how to:
 * a) handle aliases for proxied schemas
 * b) handle errors from proxied schemas
 * c) handle external to internal enum conversion
 * d) fall back to the field name for plain resolver data merged into
 *    external objects, which is keyed by literal field name
 */
export function defaultMergedResolver(
  parent: ExternalObject,
  args: Record<string, any>,
  context: Record<string, any>,
  info: GraphQLResolveInfo,
) {
  if (!parent) {
    return null;
  }

  const responseKey = info.fieldNodes[0]!.alias?.value ?? info.fieldName;

  // check to see if parent is not a proxied result, i.e. if parent resolver was manually overwritten
  // See https://github.com/ardatan/graphql-tools/issues/967
  if (!isExternalObject(parent)) {
    return defaultFieldResolver(parent, args, context, info);
  }

  // Nested @stream under a defer-capable subgraph: yield items as
  // IncrementalReceiver fills list indices (initial payload may only have
  // initialCount entries while hasNext is still true).
  const streamReceiver = getReceiver(parent);
  if (streamReceiver && fieldHasStreamDirective(info)) {
    return streamReceiver.streamList(info);
  }

  // If the parent is satisfied for the left over after a nested delegation, try to resolve it
  if (isMissingFieldValue(parent, responseKey)) {
    // Patches from a defer-capable subgraph arrive via IncrementalReceiver.
    // Use requestField (object identity) so batch-delegate splits of nested
    // lists still resolve deferred keys on the correct parent object.
    const receiver = getReceiver(parent);
    if (receiver) {
      return handleMaybePromise(
        () => receiver.requestField(parent, responseKey),
        (value) =>
          resolveExternalValue(
            value,
            getUnpathedErrors(parent),
            getSubschema(parent, responseKey),
            context,
            info,
          ),
      );
    }
    const leftOver = getPlanLeftOverFromParent(parent);
    // Add this field to the deferred fields
    if (leftOver) {
      let missingFieldNodes = leftOver.missingFieldsParentMap.get(parent);
      if (!missingFieldNodes) {
        missingFieldNodes = [];
        leftOver.missingFieldsParentMap.set(parent, missingFieldNodes);
      }
      missingFieldNodes.push(
        ...info.fieldNodes.filter((fieldNode) =>
          leftOver.unproxiableFieldNodes.some(
            (unproxiableFieldNode) => unproxiableFieldNode === fieldNode,
          ),
        ),
      );
      let missingDeferredFields =
        leftOver.missingFieldsParentDeferredMap.get(parent);
      if (!missingDeferredFields) {
        missingDeferredFields = new Map();
        leftOver.missingFieldsParentDeferredMap.set(
          parent,
          missingDeferredFields,
        );
      }
      const deferred = createDeferredPromise<unknown>();
      missingDeferredFields.set(responseKey, deferred);
      const stitchingInfo = info.schema.extensions?.[
        'stitchingInfo'
      ] as StitchingInfo;
      const parentTypeName = parent?.__typename || info.parentType.name;
      const fieldNodesByType =
        stitchingInfo?.fieldNodesByField?.[parentTypeName]?.[info.fieldName];
      if (
        fieldNodesByType?.every((fieldNode) => {
          const key = fieldNode.alias?.value ?? fieldNode.name.value;
          return !isMissingFieldValue(parent, key);
        })
      ) {
        handleResult(parent, responseKey, context, info);
      } else {
        // not all fields are present, we need to resolve more leftovers
        // this can occur when there are circular @requires, see requires-circular audit test
        handleLeftOver(parent, context, info, leftOver);
      }
      return deferred.promise;
    }
    // plain resolver data merged into an external object is keyed by the
    // literal field name; when the request aliases the field, resolve it the
    // way graphql-js default resolution would on a plain object
    if (!isMissingFieldValue(parent, info.fieldName)) {
      return defaultFieldResolver(parent, args, context, info);
    }
    const stitchingInfo = info.schema?.extensions?.[
      'stitchingInfo'
    ] as StitchingInfo;
    const parentTypeName = parent.__typename || info.parentType?.name;
    const mergedTypeInfo = parentTypeName
      ? stitchingInfo?.mergedTypes[parentTypeName]
      : undefined;
    const sourceSubschema = parent[OBJECT_SUBSCHEMA_SYMBOL] as Subschema;
    if (mergedTypeInfo && sourceSubschema) {
      const fieldNode: FieldNode = {
        kind: Kind.FIELD,
        name: info.fieldNodes[0]?.name ?? {
          kind: Kind.NAME,
          value: info.fieldName,
        },
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: info.fieldNodes,
        },
      };
      return handleMaybePromise(
        () =>
          mergeFields(mergedTypeInfo, parent, sourceSubschema, context, info, [
            fieldNode,
          ]),
        () => {
          if (!isMissingFieldValue(parent, responseKey)) {
            return handleResult(parent, responseKey, context, info);
          }
          // Deferred selections are omitted from the initial subgraph request.
          // mergeFields only plans fields that live on *other* subschemas, so a
          // field that belongs on the source subschema but was skipped under
          // @defer must be re-fetched from that source (or resolved locally).
          return resolveMissingFieldFromSourceSubschema(
            parent,
            args,
            context,
            info,
            sourceSubschema,
            mergedTypeInfo,
          );
        },
      );
    }
    if (sourceSubschema) {
      return resolveMissingFieldFromSourceSubschema(
        parent,
        args,
        context,
        info,
        sourceSubschema,
      );
    }
    return undefined;
  }
  return handleResult(parent, responseKey, context, info);
}

/**
 * Resolve a field that was skipped in the initial delegation (typically because
 * it lived under `@defer`).
 *
 * Prefer the merged-type resolver for the source subschema when one exists so
 * HTTP / remote subschemas can be re-queried by key. Otherwise fall back to a
 * local field resolver on an executable source schema.
 */
function resolveMissingFieldFromSourceSubschema(
  parent: ExternalObject,
  args: Record<string, any>,
  context: Record<string, any>,
  info: GraphQLResolveInfo,
  subschema: GraphQLSchema | SubschemaConfig | Subschema,
  mergedTypeInfo?: MergedTypeInfo,
) {
  const responseKey = info.fieldNodes[0]!.alias?.value ?? info.fieldName;
  const typedSubschema = subschema as Subschema;
  const parentTypeName = parent.__typename || info.parentType.name;

  // Prefer transformedSchema for merge planning (field presence), but always
  // resolve local fields from the original executable schema - transformed
  // schemas may already point at defaultMergedResolver and would recurse.
  const originalSchema: GraphQLSchema | undefined =
    (subschema as SubschemaConfig).schema ??
    (subschema instanceof GraphQLSchema ? subschema : undefined);
  const planningSchema =
    typedSubschema.transformedSchema ?? originalSchema ?? undefined;
  const typeInSubschema = planningSchema?.getType(parentTypeName);
  const fieldInSubschema =
    isObjectType(typeInSubschema) &&
    typeInSubschema.getFields()[info.fieldName] != null;

  // Only re-query the source subschema when the missing field actually exists
  // there (deferred exclusion). Fields that live on other subschemas are owned
  // by mergeFields above - do not invent a source refetch for them.
  const mergedTypeResolver =
    fieldInSubschema && mergedTypeInfo?.resolvers?.get(typedSubschema);

  if (mergedTypeResolver && isObjectType(typeInSubschema)) {
    const selectionSet: SelectionSetNode = {
      kind: Kind.SELECTION_SET,
      selections: info.fieldNodes,
    };

    return handleMaybePromise(
      () =>
        mergedTypeResolver(
          parent,
          context,
          info,
          typedSubschema,
          selectionSet,
          undefined,
          typeInSubschema,
        ),
      (resolverResult) => {
        handleResolverResult(
          resolverResult,
          typedSubschema,
          selectionSet,
          parent,
          parent[FIELD_SUBSCHEMA_MAP_SYMBOL] ?? Object.create(null),
          info,
          responsePathAsArray(info.path).slice(0, -1),
          parent[UNPATHED_ERRORS_SYMBOL] ?? [],
        );
        if (!isMissingFieldValue(parent, responseKey)) {
          return handleResult(parent, responseKey, context, info);
        }
        return undefined;
      },
    );
  }

  if (originalSchema == null) {
    return undefined;
  }

  // HoistField: resolve the nested source field on the path the transform wraps.
  const hoist = getHoistFieldMeta(subschema, parentTypeName, info.fieldName);
  if (hoist) {
    const target = getHoistedFieldTarget(parent, hoist);
    const sourceType = getHoistedSourceType(
      originalSchema,
      // Prefer the original type name when RenameTypes is also present.
      resolveOriginalTypeName(originalSchema, parentTypeName, hoist.typeName),
      hoist,
    );
    if (target && isObjectType(sourceType)) {
      // Value may already be present from a forwarded nested patch.
      if (!isMissingFieldValue(target.parent, target.fieldName)) {
        const value = applyLeafOutputTransforms(
          subschema,
          info,
          target.parent[target.fieldName],
        );
        parent[responseKey] = value;
        return resolveExternalValue(
          value,
          getUnpathedErrors(parent),
          subschema as any,
          context,
          info,
        );
      }
      const nestedField = sourceType.getFields()[target.fieldName];
      const nestedResolve = nestedField?.resolve;
      if (nestedResolve != null && nestedResolve !== defaultFieldResolver) {
        return handleMaybePromise(
          () => nestedResolve(target.parent, args, context, info),
          (value) => {
            const mapped = applyLeafOutputTransforms(subschema, info, value);
            parent[responseKey] = mapped;
            if (parent[FIELD_SUBSCHEMA_MAP_SYMBOL]) {
              parent[FIELD_SUBSCHEMA_MAP_SYMBOL][responseKey] =
                subschema as any;
            }
            return resolveExternalValue(
              mapped,
              getUnpathedErrors(parent),
              subschema as any,
              context,
              info,
            );
          },
        );
      }
    }
  }

  const sourceFieldName = resolveSourceFieldName(
    subschema,
    parentTypeName,
    info.fieldName,
  );

  // After transforms like RenameTypes, parent.__typename / info.parentType may
  // use the gateway name while the executable source schema still uses the
  // original name. Fall back to a unique field-owner match when needed.
  let originalType = originalSchema.getType(parentTypeName);
  if (!isObjectType(originalType)) {
    const candidates = Object.values(originalSchema.getTypeMap()).filter(
      (t) =>
        isObjectType(t) &&
        !t.name.startsWith('__') &&
        t.getFields()[sourceFieldName] != null,
    );
    originalType = candidates.length === 1 ? candidates[0] : undefined;
  }
  if (!isObjectType(originalType)) {
    return undefined;
  }

  const field = originalType.getFields()[sourceFieldName];
  const resolve = field?.resolve;
  if (resolve == null || resolve === defaultFieldResolver) {
    // Skip the schema-default field resolver: it only reads parent[fieldName],
    // which is exactly what we already know is missing.
    return undefined;
  }

  // wrapSchema(stitched): the source field resolver is defaultMergedResolver
  // again. Calling it with the same parent recurses. Re-fetch via the nested
  // schema's merged-type resolver for the field owner when available.
  if (
    resolve === defaultMergedResolver ||
    resolve.name === 'defaultMergedResolver'
  ) {
    const innerStitchingInfo = originalSchema.extensions?.['stitchingInfo'] as
      | StitchingInfo
      | undefined;
    const innerTypeName =
      (typeof parent.__typename === 'string' && parent.__typename) ||
      parentTypeName;
    const innerMergedTypeInfo = innerStitchingInfo?.mergedTypes[innerTypeName];
    const fieldOwner =
      innerMergedTypeInfo?.uniqueFields[sourceFieldName] ??
      innerMergedTypeInfo?.nonUniqueFields[sourceFieldName]?.[0];
    const ownerResolver =
      fieldOwner && innerMergedTypeInfo?.resolvers.get(fieldOwner);
    const typeInOwner =
      fieldOwner &&
      (fieldOwner.transformedSchema.getType(innerTypeName) ??
        originalSchema.getType(innerTypeName));
    if (
      ownerResolver &&
      fieldOwner &&
      typeInOwner &&
      isObjectType(typeInOwner)
    ) {
      const selectionSet: SelectionSetNode = {
        kind: Kind.SELECTION_SET,
        selections: info.fieldNodes,
      };
      // Annotate a working copy so handleResolverResult can merge into it
      // without mutating outer wrap symbols incorrectly.
      const innerParent: ExternalObject = annotateExternalObject(
        { ...parent },
        getUnpathedErrors(parent),
        fieldOwner,
        Object.create(null),
      );
      const innerInfo = { ...info, schema: originalSchema };
      return handleMaybePromise(
        () =>
          ownerResolver(
            innerParent,
            context,
            innerInfo,
            fieldOwner,
            selectionSet,
            undefined,
            typeInOwner,
          ),
        (resolverResult) => {
          handleResolverResult(
            resolverResult,
            fieldOwner,
            selectionSet,
            innerParent,
            innerParent[FIELD_SUBSCHEMA_MAP_SYMBOL] ?? Object.create(null),
            innerInfo,
            responsePathAsArray(info.path).slice(0, -1),
            innerParent[UNPATHED_ERRORS_SYMBOL] ?? [],
          );
          if (!isMissingFieldValue(innerParent, responseKey)) {
            const value = innerParent[responseKey];
            parent[responseKey] = value;
            if (parent[FIELD_SUBSCHEMA_MAP_SYMBOL]) {
              parent[FIELD_SUBSCHEMA_MAP_SYMBOL][responseKey] =
                subschema as any;
            }
            return resolveExternalValue(
              value,
              getUnpathedErrors(parent),
              subschema as any,
              context,
              info,
            );
          }
          return undefined;
        },
      );
    }
    // No nested merge plan — avoid the recursive call.
    return undefined;
  }

  return handleMaybePromise(
    () => resolve(parent, args, context, info),
    (value) => {
      // Local resolve bypasses transformResult; still apply leaf output maps
      // (MapLeafValues) so deferred scalars match non-deferred behaviour.
      const mapped = applyLeafOutputTransforms(subschema, info, value);
      parent[responseKey] = mapped;
      if (parent[FIELD_SUBSCHEMA_MAP_SYMBOL]) {
        parent[FIELD_SUBSCHEMA_MAP_SYMBOL][responseKey] = subschema as any;
      }
      return resolveExternalValue(
        mapped,
        getUnpathedErrors(parent),
        subschema as any,
        context,
        info,
      );
    },
  );
}

/**
 * Apply MapLeafValues-style output visitors when a deferred field is resolved
 * via the original local resolver (which skips the transformResult pipeline).
 */
function applyLeafOutputTransforms(
  subschema: GraphQLSchema | SubschemaConfig | Subschema,
  info: GraphQLResolveInfo,
  value: any,
): any {
  if (value == null) {
    return value;
  }
  const transforms =
    (subschema as Subschema).transforms ??
    (subschema as SubschemaConfig).transforms;
  if (!transforms?.length) {
    return value;
  }
  const typeName = getNamedType(info.returnType)?.name;
  if (!typeName) {
    return value;
  }
  let mapped = value;
  for (const transform of transforms) {
    const visitor = (transform as any).resultVisitorMap?.[typeName];
    if (typeof visitor === 'function') {
      mapped = visitor(mapped);
    }
  }
  return mapped;
}

function resolveOriginalTypeName(
  originalSchema: GraphQLSchema,
  gatewayTypeName: string,
  fallbackTypeName: string,
): string {
  if (isObjectType(originalSchema.getType(gatewayTypeName))) {
    return gatewayTypeName;
  }
  if (isObjectType(originalSchema.getType(fallbackTypeName))) {
    return fallbackTypeName;
  }
  return gatewayTypeName;
}

function handleResult<TContext extends Record<string, any>>(
  parent: ExternalObject,
  responseKey: string,
  context: TContext,
  info: GraphQLResolveInfo,
) {
  const subschema = getSubschema(parent, responseKey);
  const data = parent[responseKey];
  const unpathedErrors = getUnpathedErrors(parent);

  const resolvedData$ = resolveExternalValue(
    data,
    unpathedErrors,
    subschema,
    context,
    info,
  );
  const leftOver = getPlanLeftOverFromParent(parent);
  // Handle possible deferred fields if any left over from the previous delegation plan is found
  if (leftOver) {
    return handleMaybePromise(
      () => resolvedData$,
      (resolvedData) => {
        parent[responseKey] = resolvedData;
        handleLeftOver(parent, context, info, leftOver);
        return resolvedData;
      },
    );
  }
  return resolvedData$;
}

function handleLeftOver<TContext extends Record<string, any>>(
  parent: ExternalObject,
  context: TContext,
  info: GraphQLResolveInfo,
  leftOver: DelegationPlanLeftOver,
) {
  const stitchingInfo = info.schema.extensions?.[
    'stitchingInfo'
  ] as StitchingInfo;
  if (stitchingInfo) {
    for (const possibleSubschema of leftOver.nonProxiableSubschemas) {
      const parentTypeName = info.parentType.name;
      const selectionSets = new Set<SelectionSetNode>();
      const mainSelectionSet =
        stitchingInfo.mergedTypes[parentTypeName]?.selectionSets.get(
          possibleSubschema,
        );
      if (mainSelectionSet) {
        selectionSets.add(mainSelectionSet);
      }
      for (const fieldNode of leftOver.unproxiableFieldNodes) {
        const fieldName = fieldNode.name.value;
        const fieldSelectionSet =
          stitchingInfo.mergedTypes[parentTypeName]?.fieldSelectionSets.get(
            possibleSubschema,
          )?.[fieldName];
        if (fieldSelectionSet) {
          selectionSets.add(fieldSelectionSet);
        }
      }
      // Wait until the parent is flattened, then check if non proxiable subschemas are satisfied now,
      // then the deferred fields can be resolved
      if (selectionSets.size) {
        const selectionSet: SelectionSetNode = {
          kind: Kind.SELECTION_SET,
          selections: Array.from(selectionSets).flatMap(
            (selectionSet) => selectionSet.selections,
          ),
        };
        handleMaybePromise(
          () => flattenPromise(parent),
          (flattenedParent) => {
            handleFlattenedParent(
              flattenedParent,
              parent,
              possibleSubschema,
              selectionSet,
              leftOver,
              stitchingInfo,
              parentTypeName,
              context,
              info,
            );
          },
        );
      }
    }
  }
}

function handleFlattenedParent<TContext extends Record<string, any>>(
  flattenedParent: ExternalObject,
  leftOverParent: ExternalObject,
  possibleSubschema: Subschema,
  selectionSet: SelectionSetNode,
  leftOver: DelegationPlanLeftOver,
  stitchingInfo: StitchingInfo,
  parentTypeName: string,
  context: TContext,
  info: GraphQLResolveInfo,
) {
  // If this subschema is satisfied now, try to resolve the deferred fields
  if (parentSatisfiedSelectionSet(flattenedParent, selectionSet)) {
    const missingFieldNodes =
      leftOver.missingFieldsParentMap.get(leftOverParent);
    if (missingFieldNodes) {
      const resolver =
        stitchingInfo.mergedTypes[parentTypeName]?.resolvers.get(
          possibleSubschema,
        );
      if (resolver) {
        // Extend the left over parent with missing fields
        Object.assign(leftOverParent, flattenedParent);
        const selectionSet: SelectionSetNode = {
          kind: Kind.SELECTION_SET,
          selections: missingFieldNodes,
        };
        handleMaybePromise(
          () =>
            resolver(
              leftOverParent,
              context,
              info,
              possibleSubschema,
              selectionSet,
              info.parentType,
              info.parentType,
            ),
          (resolverResult) => {
            handleDeferredResolverResult(
              resolverResult,
              possibleSubschema,
              selectionSet,
              leftOverParent,
              leftOver,
              context,
              info,
            );
          },
          (error) =>
            handleDeferredResolverFailure(leftOver, leftOverParent, error),
        );
      }
    }
  } else {
    // try to resolve the missing fields
    for (const selectionNode of selectionSet.selections) {
      if (
        selectionNode.kind === Kind.FIELD &&
        selectionNode.selectionSet?.selections?.length
      ) {
        const responseKey =
          selectionNode.alias?.value ?? selectionNode.name.value;
        const nestedParent = flattenedParent[responseKey];
        const nestedSelectionSet = selectionNode.selectionSet;
        if (nestedParent != null) {
          if (!parentSatisfiedSelectionSet(nestedParent, nestedSelectionSet)) {
            async function handleNestedParentItem(
              nestedParentItem: any,
              fieldNode: FieldNode,
            ) {
              const nestedTypeName = nestedParentItem['__typename'];
              const sourceSubschema = getSubschema(
                flattenedParent,
                responseKey,
              ) as Subschema;
              if (sourceSubschema && nestedTypeName) {
                const variableValues = getCoercedVariableValues(
                  info.variableValues,
                );
                const delegationPlan = stitchingInfo.mergedTypes[
                  nestedTypeName
                ]?.delegationPlanBuilder(
                  info.schema,
                  sourceSubschema,
                  variableValues != null &&
                    Object.keys(variableValues).length > 0
                    ? variableValues
                    : EMPTY_OBJECT,
                  info.fragments != null &&
                    Object.keys(info.fragments).length > 0
                    ? info.fragments
                    : EMPTY_OBJECT,
                  getActualFieldNodes(fieldNode),
                  context,
                  info,
                );
                if (delegationPlan?.length) {
                  // Later optimize
                  for (const delegationMap of delegationPlan) {
                    for (const [subschema, selectionSet] of delegationMap) {
                      const resolver =
                        stitchingInfo.mergedTypes[
                          nestedTypeName
                        ]?.resolvers.get(subschema);
                      if (resolver) {
                        const subschemaTypes =
                          stitchingInfo.mergedTypes[
                            nestedTypeName
                          ]!.typeMaps.get(subschema)!;
                        const returnType = subschemaTypes[nestedTypeName];
                        const res = await resolver(
                          nestedParentItem,
                          context,
                          info,
                          subschema,
                          selectionSet,
                          returnType, // returnType
                          info.parentType,
                        );
                        if (res) {
                          handleResolverResult(
                            res,
                            subschema,
                            selectionSet,
                            nestedParentItem,
                            (nestedParentItem[FIELD_SUBSCHEMA_MAP_SYMBOL] ||=
                              new Map()),
                            info,
                            responsePathAsArray(info.path),
                            (nestedParentItem[UNPATHED_ERRORS_SYMBOL] ||= []),
                          );
                        }
                      }
                    }
                  }
                }
                if (
                  parentSatisfiedSelectionSet(nestedParent, nestedSelectionSet)
                ) {
                  handleFlattenedParent(
                    flattenedParent,
                    leftOverParent,
                    possibleSubschema,
                    selectionSet,
                    leftOver,
                    stitchingInfo,
                    parentTypeName,
                    context,
                    info,
                  );
                }
              }
            }
            if (Array.isArray(nestedParent)) {
              nestedParent.forEach((nestedParentItem) =>
                handleNestedParentItem(nestedParentItem, selectionNode),
              );
            } else {
              handleNestedParentItem(nestedParent, selectionNode);
            }
          }
        }
      }
    }
  }
}

function handleDeferredResolverResult<TContext extends Record<string, any>>(
  resolverResult: ReturnType<MergedTypeResolver>,
  possibleSubschema: Subschema,
  selectionSet: SelectionSetNode,
  leftOverParent: ExternalObject,
  leftOver: DelegationPlanLeftOver,
  context: TContext,
  info: GraphQLResolveInfo,
) {
  handleResolverResult(
    resolverResult,
    possibleSubschema,
    selectionSet,
    leftOverParent,
    leftOverParent[FIELD_SUBSCHEMA_MAP_SYMBOL],
    info,
    responsePathAsArray(info.path),
    leftOverParent[UNPATHED_ERRORS_SYMBOL],
  );
  const deferredFields =
    leftOver.missingFieldsParentDeferredMap.get(leftOverParent);
  if (deferredFields) {
    const stitchingInfo = info.schema.extensions?.[
      'stitchingInfo'
    ] as StitchingInfo;
    const parentTypeName = leftOverParent?.__typename || info.parentType.name;
    const resolvedKeys = new Set<string>();
    for (const [responseKey, deferred] of deferredFields) {
      // after handleResolverResult, check if the field is now in the parent
      if (Object.prototype.hasOwnProperty.call(leftOverParent, responseKey)) {
        // field was added to parent by handleResolverResult
        deferred.resolve(
          handleResult(leftOverParent, responseKey, context, info),
        );
        resolvedKeys.add(responseKey);
      } else {
        // check if the required fields for this deferred field are now satisfied
        const fieldNodesByType =
          stitchingInfo?.fieldNodesByField?.[parentTypeName]?.[responseKey];
        if (fieldNodesByType) {
          if (
            fieldNodesByType.every((fieldNode) => {
              const requiredKey =
                fieldNode.alias?.value ?? fieldNode.name.value;
              return Object.prototype.hasOwnProperty.call(
                leftOverParent,
                requiredKey,
              );
            })
          ) {
            // requirements are satisfied, trigger handleLeftOver to fetch this field
            setTimeout(() => {
              handleLeftOver(leftOverParent, context, info, leftOver);
            }, 0);
          }
        }
      }
    }
    // delete resolved deferred fields
    for (const key of resolvedKeys) {
      deferredFields.delete(key);
    }
    // and delete map if empty
    if (deferredFields.size === 0) {
      leftOver.missingFieldsParentDeferredMap.delete(leftOverParent);
    }
  }
}

function handleDeferredResolverFailure(
  leftOver: DelegationPlanLeftOver,
  leftOverParent: ExternalObject,
  error: unknown,
) {
  const deferredFields =
    leftOver.missingFieldsParentDeferredMap.get(leftOverParent);
  if (deferredFields) {
    for (const [_responseKey, deferred] of deferredFields) {
      deferred.reject(error);
    }
    leftOver.missingFieldsParentDeferredMap.delete(leftOverParent);
  }
}

function parentSatisfiedSelectionSet(
  parent: any,
  selectionSet: SelectionSetNode,
): Set<Subschema> | undefined {
  if (Array.isArray(parent)) {
    const subschemas = new Set<Subschema>();
    for (const item of parent) {
      const satisfied = parentSatisfiedSelectionSet(item, selectionSet);
      if (satisfied === undefined) {
        return undefined;
      }
      for (const subschema of satisfied) {
        subschemas.add(subschema);
      }
    }
    return subschemas;
  }
  if (parent === null) {
    return new Set<Subschema>();
  }
  if (parent === undefined) {
    return undefined;
  }
  const subschemas = new Set<Subschema>();
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const responseKey = selection.alias?.value ?? selection.name.value;
      if (parent[responseKey] === undefined) {
        return undefined;
      }
      if (isExternalObject(parent)) {
        const subschema = getSubschema(parent, responseKey) as Subschema;
        if (subschema) {
          subschemas.add(subschema);
        }
      }
      if (parent[responseKey] === null) {
        continue;
      }
      if (selection.selectionSet != null) {
        const satisfied = parentSatisfiedSelectionSet(
          parent[responseKey],
          selection.selectionSet,
        );
        if (satisfied === undefined) {
          return undefined;
        }
        for (const subschema of satisfied) {
          subschemas.add(subschema);
        }
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const inlineSatisfied = parentSatisfiedSelectionSet(
        parent,
        selection.selectionSet,
      );
      if (inlineSatisfied === undefined) {
        return undefined;
      }
      for (const subschema of inlineSatisfied) {
        subschemas.add(subschema);
      }
    }
  }
  return subschemas;
}

function flattenPromise<T>(data: T): Promise<T> | T {
  if (isPromise(data)) {
    return data.then(flattenPromise);
  }
  if (Array.isArray(data)) {
    return Promise.all(data.map(flattenPromise)) as Promise<T>;
  }
  if (data != null && typeof data === 'object') {
    const jobs: PromiseLike<void>[] = [];
    const newData: any = {};
    for (const key in data) {
      const keyResult = flattenPromise(data[key]);
      if (isPromise(keyResult)) {
        jobs.push(
          keyResult.then((resolvedKeyResult) => {
            newData[key] = resolvedKeyResult;
          }),
        );
      } else {
        newData[key] = keyResult;
      }
    }
    if (OBJECT_SUBSCHEMA_SYMBOL in data) {
      newData[OBJECT_SUBSCHEMA_SYMBOL] = data[OBJECT_SUBSCHEMA_SYMBOL];
    }
    if (FIELD_SUBSCHEMA_MAP_SYMBOL in data) {
      newData[FIELD_SUBSCHEMA_MAP_SYMBOL] = data[FIELD_SUBSCHEMA_MAP_SYMBOL];
    }
    if (UNPATHED_ERRORS_SYMBOL in data) {
      newData[UNPATHED_ERRORS_SYMBOL] = data[UNPATHED_ERRORS_SYMBOL];
    }
    if (jobs.length) {
      return Promise.all(jobs).then(() => newData);
    }
    return newData;
  }
  return data;
}
