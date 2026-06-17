import { CRITICAL_ERROR } from '@graphql-tools/executor';
import {
  ASTVisitorKeyMap,
  createGraphQLError,
  ExecutionRequest,
  getDefinedRootType,
  implementsAbstractType,
  memoize1,
  memoize2,
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
  originalDocument: DocumentNode,
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
    if (fragment.selectionSet.selections.length === 0) {
      continue;
    }
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

  const includedFragmentNames = new Set(newFragments.map((f) => f.name.value));
  const hasDroppedFragments = includedFragmentNames.size < usedFragments.length;

  let newDocument: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions: [...newOperations, ...newFragments],
  };

  const stitchingInfo = delegationContext.info?.schema?.extensions?.[
    'stitchingInfo'
  ] as StitchingInfo;
  // Skip the (relatively expensive) `@provides` traversal entirely when the
  // current subschema has no provided selections configured. This avoids
  // walking the entire document twice on every delegation for non-federated
  // subgraphs or subgraphs that do not participate in `@provides`.
  if (
    stitchingInfo != null &&
    subschemaHasProvidedSelections(
      stitchingInfo,
      delegationContext.subschema as Subschema,
    )
  ) {
    // Capture the user's original selection sets keyed by path so that we can
    // restrict the `@provides` injection below to only the fields the client
    // actually requested. Without this, every field listed in `@provides` would
    // be sent to the providing subgraph even when the client never asked for it.
    const {
      selectionSetsByPath: originalFieldSelectionSetsByPath,
      fragments: originalFragmentsByName,
    } = collectFieldSelectionSetsByPath(originalDocument);
    const typeInfo = getTypeInfo(targetSchema);
    const pathStack: string[] = [];
    // Per-selection-set sibling counters used to disambiguate untyped or
    // repeated inline fragments (e.g. `... { ... }` siblings) so that path
    // keys built during the visit match the keys produced by
    // `collectFieldSelectionSetsByPath` exactly.
    const inlineFragmentCounterStack: Array<Map<string, number>> = [];
    newDocument = visit(
      newDocument,
      visitWithTypeInfo(typeInfo, {
        [Kind.SELECTION_SET]: {
          enter() {
            inlineFragmentCounterStack.push(new Map());
          },
          leave() {
            inlineFragmentCounterStack.pop();
          },
        },
        [Kind.OPERATION_DEFINITION]: {
          enter(node) {
            pathStack.push(`op:${node.operation}:${node.name?.value ?? ''}`);
          },
          leave() {
            pathStack.pop();
          },
        },
        [Kind.FRAGMENT_DEFINITION]: {
          enter(node) {
            pathStack.push(`frag:${node.name.value}`);
          },
          leave() {
            pathStack.pop();
          },
        },
        [Kind.INLINE_FRAGMENT]: {
          enter(node) {
            // The inline fragment's own SelectionSet has not been entered yet,
            // so the top of the stack still belongs to the enclosing selection
            // set whose siblings we need to disambiguate.
            pathStack.push(
              nextInlineFragmentPathSegment(
                node,
                inlineFragmentCounterStack[
                  inlineFragmentCounterStack.length - 1
                ],
              ),
            );
          },
          leave() {
            pathStack.pop();
          },
        },
        [Kind.FIELD]: {
          enter(fieldNode) {
            pathStack.push(fieldNode.alias?.value ?? fieldNode.name.value);
          },
          leave(fieldNode) {
            try {
              const parentType = typeInfo.getParentType();
              if (!parentType) {
                return undefined;
              }
              const typeConfig = stitchingInfo?.mergedTypes?.[parentType.name];
              const providedSelectionsByField =
                typeConfig?.providedSelectionsByField?.get(
                  delegationContext.subschema as Subschema,
                );
              const providedSelection =
                providedSelectionsByField?.[fieldNode.name.value];
              if (!providedSelection) {
                return undefined;
              }
              const originalSelectionSet = lookupOriginalSelectionSet(
                pathStack,
                fieldNode,
                originalFieldSelectionSetsByPath,
              );
              const requestedProvidedSelections = intersectProvidedSelections(
                providedSelection.selections,
                originalSelectionSet,
                originalFragmentsByName,
              );
              if (!requestedProvidedSelections.length) {
                return undefined;
              }
              return {
                ...fieldNode,
                selectionSet: {
                  kind: Kind.SELECTION_SET,
                  selections: [
                    ...requestedProvidedSelections,
                    ...(fieldNode.selectionSet?.selections ?? []),
                  ],
                },
              };
            } finally {
              pathStack.pop();
            }
          },
        },
      }),
    );
  }

  // strip dangling fragment spreads that point to fragments that were dropped
  // because all their fields are @external in the target subgraph. this must
  // run after the @provides injection so that provided fields are already
  // inlined before the now-empty spreads are removed.
  if (hasDroppedFragments) {
    const ops = newDocument.definitions.filter(
      (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
    );
    const frags = newDocument.definitions.filter(
      (d): d is FragmentDefinitionNode => d.kind === Kind.FRAGMENT_DEFINITION,
    );
    newDocument = {
      kind: Kind.DOCUMENT,
      definitions: [
        ...removeDeadFragmentSpreads(ops, includedFragmentNames),
        ...frags,
      ],
    };
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
    originalRequest.document,
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

function removeDeadFragmentSpreads(
  operations: OperationDefinitionNode[],
  included: Set<string>,
): OperationDefinitionNode[] {
  function cleanSelections(
    selections: readonly SelectionNode[],
  ): SelectionNode[] {
    const out: SelectionNode[] = [];
    for (const sel of selections) {
      if (sel.kind === Kind.FRAGMENT_SPREAD) {
        if (included.has(sel.name.value)) {
          out.push(sel);
        }
        // drop spreads referencing dropped (empty) fragments
      } else if (
        (sel.kind === Kind.FIELD || sel.kind === Kind.INLINE_FRAGMENT) &&
        sel.selectionSet
      ) {
        const cleaned = cleanSelections(sel.selectionSet.selections);
        if (cleaned.length === 0 && sel.kind === Kind.INLINE_FRAGMENT) {
          // inline fragment became empty, drop it
          continue;
        }
        if (cleaned.length === 0 && sel.kind === Kind.FIELD) {
          // composite field with no remaining selections, drop it
          continue;
        }
        out.push(
          cleaned === sel.selectionSet.selections
            ? sel
            : {
                ...sel,
                selectionSet: {
                  kind: Kind.SELECTION_SET,
                  selections: cleaned,
                },
              },
        );
      } else {
        out.push(sel);
      }
    }
    return out;
  }

  return operations.map((op) => ({
    ...op,
    selectionSet: {
      ...op.selectionSet,
      selections: cleanSelections(op.selectionSet.selections),
    },
  }));
}

function isTypeNameField(selection: SelectionNode): boolean {
  return (
    selection.kind === Kind.FIELD &&
    !selection.alias &&
    selection.name.value === '__typename'
  );
}

function collectFieldSelectionSetsByPathImpl(document: DocumentNode): {
  selectionSetsByPath: Map<string, SelectionSetNode>;
  fragments: Map<string, FragmentDefinitionNode>;
} {
  const selectionSetsByPath = new Map<string, SelectionSetNode>();
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const def of document.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(def.name.value, def);
    }
  }
  const pathStack: string[] = [];
  // Per-selection-set sibling counters used to disambiguate untyped or repeated
  // inline fragments (e.g. `... { a } ... { b }`) so each sibling produces a
  // unique path key.
  const inlineFragmentCounterStack: Array<Map<string, number>> = [];
  visit(document, {
    [Kind.SELECTION_SET]: {
      enter() {
        inlineFragmentCounterStack.push(new Map());
      },
      leave() {
        inlineFragmentCounterStack.pop();
      },
    },
    [Kind.OPERATION_DEFINITION]: {
      enter(node) {
        pathStack.push(`op:${node.operation}:${node.name?.value ?? ''}`);
      },
      leave() {
        pathStack.pop();
      },
    },
    [Kind.FRAGMENT_DEFINITION]: {
      enter(node) {
        pathStack.push(`frag:${node.name.value}`);
      },
      leave() {
        pathStack.pop();
      },
    },
    [Kind.INLINE_FRAGMENT]: {
      enter(node) {
        pathStack.push(
          nextInlineFragmentPathSegment(
            node,
            inlineFragmentCounterStack[inlineFragmentCounterStack.length - 1],
          ),
        );
      },
      leave() {
        pathStack.pop();
      },
    },
    [Kind.FIELD]: {
      enter(node) {
        pathStack.push(node.alias?.value ?? node.name.value);
        if (node.selectionSet) {
          selectionSetsByPath.set(pathStack.join('>'), node.selectionSet);
          if (node.alias) {
            // Also index the selection set by the response key built from the
            // field name. Some downstream transforms (e.g. the nullable/non
            // nullable alias handling) inject synthetic aliases that the
            // visit-time path stack would fail to find otherwise.
            const namePath = [...pathStack.slice(0, -1), node.name.value].join(
              '>',
            );
            if (!selectionSetsByPath.has(namePath)) {
              selectionSetsByPath.set(namePath, node.selectionSet);
            }
          }
        }
      },
      leave() {
        pathStack.pop();
      },
    },
  });
  return { selectionSetsByPath, fragments };
}

// Memoized so the original document is only walked once across the lifetime of
// a request even if multiple subschemas ask for the same lookup map.
const collectFieldSelectionSetsByPath = memoize1(
  collectFieldSelectionSetsByPathImpl,
);

function nextInlineFragmentPathSegment(
  node: { typeCondition?: { name: { value: string } } | undefined | null },
  counter: Map<string, number> | undefined,
): string {
  const typeName = node.typeCondition?.name.value ?? '';
  if (!counter) {
    return `inline:${typeName}:0`;
  }
  const idx = counter.get(typeName) ?? 0;
  counter.set(typeName, idx + 1);
  return `inline:${typeName}:${idx}`;
}

function subschemaHasProvidedSelectionsImpl(
  stitchingInfo: StitchingInfo,
  subschema: Subschema,
): boolean {
  const mergedTypes = stitchingInfo.mergedTypes;
  if (!mergedTypes) {
    return false;
  }
  for (const typeConfig of Object.values(mergedTypes)) {
    if (typeConfig?.providedSelectionsByField?.has(subschema)) {
      return true;
    }
  }
  return false;
}

// Memoized because both `stitchingInfo` and `subschema` are stable for the
// lifetime of a stitched schema, so this is effectively a one-time scan per
// (schema, subschema) pair instead of per delegation.
const subschemaHasProvidedSelections = memoize2(
  subschemaHasProvidedSelectionsImpl,
);

function lookupOriginalSelectionSet(
  pathStack: string[],
  fieldNode: { name: { value: string }; alias?: { value: string } | undefined },
  selectionSetsByPath: Map<string, SelectionSetNode>,
): SelectionSetNode | undefined {
  const exact = selectionSetsByPath.get(pathStack.join('>'));
  if (exact || !fieldNode.alias) {
    return exact;
  }
  // Fallback: downstream transforms may rewrite the alias (for example to
  // `_nullable_<fieldName>` when reconciling overlapping nullable / non-null
  // selections). The collection step also indexes those selection sets under
  // the field's name so we can recover them here.
  const fallback = [...pathStack.slice(0, -1), fieldNode.name.value].join('>');
  return selectionSetsByPath.get(fallback);
}

/**
 * Returns the subset of `@provides` selections that the client actually
 * requested at this path. `@provides` only allows the providing subgraph to
 * resolve the listed fields; it does NOT mean the gateway should fetch all of
 * them on every visit. We therefore intersect with the original (pre-filter)
 * selection set so that fields the client never asked for are not pulled in.
 *
 * We return the original field nodes (preserving aliases and arguments) so the
 * subgraph response can be matched back to the user's request. Inline fragment
 * and fragment-spread wrappers that carry directives such as `@include` /
 * `@skip` are preserved so client-supplied conditions are still honored.
 */
function intersectProvidedSelections(
  providedSelections: readonly SelectionNode[],
  originalSelectionSet: SelectionSetNode | undefined,
  fragments: Map<string, FragmentDefinitionNode>,
): SelectionNode[] {
  if (!originalSelectionSet) {
    return [];
  }
  const providedFieldsByName = new Map<
    string,
    Extract<SelectionNode, { kind: 'Field' }>
  >();
  const otherProvided: SelectionNode[] = [];
  for (const provided of providedSelections) {
    if (provided.kind === Kind.FIELD) {
      providedFieldsByName.set(provided.name.value, provided);
    } else {
      // Inline/fragment spreads in `@provides` are uncommon; if encountered we
      // keep them as-is to match the previous behavior for those edge cases.
      otherProvided.push(provided);
    }
  }
  const result: SelectionNode[] = [];
  collectMatchingOriginalSelections(
    originalSelectionSet,
    providedFieldsByName,
    fragments,
    new Set<string>(),
    new Set<string>(),
    result,
  );
  return [...result, ...otherProvided];
}

function collectMatchingOriginalSelections(
  selectionSet: SelectionSetNode,
  providedFieldsByName: Map<string, Extract<SelectionNode, { kind: 'Field' }>>,
  fragments: Map<string, FragmentDefinitionNode>,
  seenFieldNames: Set<string>,
  seenFragmentNames: Set<string>,
  result: SelectionNode[],
): void {
  for (const sel of selectionSet.selections) {
    if (sel.kind === Kind.FIELD) {
      const provided = providedFieldsByName.get(sel.name.value);
      if (!provided) {
        continue;
      }
      const dedupKey = sel.alias?.value ?? sel.name.value;
      if (seenFieldNames.has(dedupKey)) {
        continue;
      }
      seenFieldNames.add(dedupKey);
      if (provided.selectionSet && sel.selectionSet) {
        const nested = intersectProvidedSelections(
          provided.selectionSet.selections,
          sel.selectionSet,
          fragments,
        );
        if (!nested.length) {
          continue;
        }
        result.push({
          ...sel,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: nested,
          },
        });
      } else {
        // Re-add the user's original field (with alias and arguments) so the
        // subgraph response can be merged back into the gateway response.
        result.push(sel);
      }
    } else if (sel.kind === Kind.INLINE_FRAGMENT && sel.selectionSet) {
      // Wrappers that carry conditional directives (`@include` / `@skip`) or a
      // type condition that narrows the parent type must be preserved so that
      // the providing subgraph can still honor the client's conditions.
      const hasDirectives = (sel.directives?.length ?? 0) > 0;
      const hasTypeCondition = sel.typeCondition != null;
      if (hasDirectives || hasTypeCondition) {
        const inner: SelectionNode[] = [];
        collectMatchingOriginalSelections(
          sel.selectionSet,
          providedFieldsByName,
          fragments,
          new Set<string>(),
          new Set<string>(),
          inner,
        );
        if (inner.length === 0) {
          continue;
        }
        result.push({
          kind: Kind.INLINE_FRAGMENT,
          typeCondition: sel.typeCondition,
          directives: sel.directives,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: inner,
          },
        });
      } else {
        // Untyped, undirected inline fragment - safe to flatten into the
        // surrounding selection set so dedup still applies.
        collectMatchingOriginalSelections(
          sel.selectionSet,
          providedFieldsByName,
          fragments,
          seenFieldNames,
          seenFragmentNames,
          result,
        );
      }
    } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
      const fragmentDef = fragments.get(sel.name.value);
      if (!fragmentDef) {
        continue;
      }
      const hasSpreadDirectives = (sel.directives?.length ?? 0) > 0;
      const hasFragmentDirectives = (fragmentDef.directives?.length ?? 0) > 0;
      if (hasSpreadDirectives || hasFragmentDirectives) {
        // Preserve the spread (rewritten as an inline fragment) so its
        // directives - or the fragment definition's directives - continue to
        // gate the injected selections.
        const inner: SelectionNode[] = [];
        collectMatchingOriginalSelections(
          fragmentDef.selectionSet,
          providedFieldsByName,
          fragments,
          new Set<string>(),
          new Set<string>(),
          inner,
        );
        if (inner.length === 0) {
          continue;
        }
        const combinedDirectives = [
          ...(sel.directives ?? []),
          ...(fragmentDef.directives ?? []),
        ];
        result.push({
          kind: Kind.INLINE_FRAGMENT,
          typeCondition: fragmentDef.typeCondition,
          directives:
            combinedDirectives.length > 0 ? combinedDirectives : undefined,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: inner,
          },
        });
      } else {
        if (seenFragmentNames.has(sel.name.value)) {
          continue;
        }
        seenFragmentNames.add(sel.name.value);
        collectMatchingOriginalSelections(
          fragmentDef.selectionSet,
          providedFieldsByName,
          fragments,
          seenFieldNames,
          seenFragmentNames,
          result,
        );
      }
    }
  }
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
        // skip fragments that were fully filtered away (e.g. all fields are
        // @external in the target subgraph). fragment spreads referencing them
        // will be stripped from the document in a subsequent pass.
        if (selectionSet.selections.length > 0) {
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
