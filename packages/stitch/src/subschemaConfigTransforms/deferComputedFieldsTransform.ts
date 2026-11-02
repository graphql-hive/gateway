import {
  DelegationContext,
  getVariableValues,
  SubschemaConfig,
  Transform,
} from '@graphql-tools/delegate';
import {
  collectFields,
  ExecutionRequest,
  parseSelectionSet,
} from '@graphql-tools/utils';
import {
  DocumentNode,
  FieldNode,
  getNamedType,
  GraphQLSchema,
  isObjectType,
  Kind,
  SelectionNode,
  TypeInfo,
  visit,
  visitWithTypeInfo,
} from 'graphql';

/**
 * Clone-less computed-field deferral: keep computed fields on the single
 * subschema schema (so merge hops can select them), but strip them from
 * outbound requests that are not a merge entry point (`fieldName` /
 * `entryPoints[].fieldName`). Initial Query/Mutation hops therefore never
 * resolve computed fields early with missing `@requires` deps; entity /
 * `_products`-style merge hops still receive them.
 *
 * When a computed field is stripped, inject the type's merge-key fields
 * (`@key` / `selectionSet`) so the parent still carries identity for later
 * leftover hops. Nested key selections are preserved as parsed field nodes.
 */
export class DeferComputedFieldsTransform<
  TContext = Record<string, any>,
> implements Transform<Record<string, any>, TContext> {
  private readonly computedByType: Map<string, Set<string>>;
  private readonly keyFieldsByType: Map<string, FieldNode[]>;
  private readonly mergeEntryFieldNames: Set<string>;
  private readonly schema: GraphQLSchema;

  constructor(
    schema: GraphQLSchema,
    computedByType: Map<string, Set<string>>,
    keyFieldsByType: Map<string, FieldNode[]>,
    mergeEntryFieldNames: Set<string>,
  ) {
    this.schema = schema;
    this.computedByType = computedByType;
    this.keyFieldsByType = keyFieldsByType;
    this.mergeEntryFieldNames = mergeEntryFieldNames;
  }

  transformRequest(
    originalRequest: ExecutionRequest,
    delegationContext: DelegationContext<TContext>,
  ): ExecutionRequest {
    if (this.mergeEntryFieldNames.has(delegationContext.fieldName)) {
      return originalRequest;
    }
    return {
      ...originalRequest,
      document: stripComputedFields(
        originalRequest.document,
        this.schema,
        this.computedByType,
        this.keyFieldsByType,
      ),
    };
  }
}

function stripComputedFields(
  document: DocumentNode,
  schema: GraphQLSchema,
  computedByType: Map<string, Set<string>>,
  keyFieldsByType: Map<string, FieldNode[]>,
): DocumentNode {
  if (!computedByType.size) {
    return document;
  }

  const typeInfo = new TypeInfo(schema);
  return visit(
    document,
    visitWithTypeInfo(typeInfo, {
      [Kind.SELECTION_SET]: {
        leave(node) {
          const parentType = typeInfo.getParentType();
          if (parentType == null) {
            return node;
          }
          const typeName = getNamedType(parentType).name;
          const computed = computedByType.get(typeName);
          if (!computed?.size) {
            return node;
          }
          const keys = keyFieldsByType.get(typeName);
          const selections = filterComputedSelections(
            node.selections,
            computed,
            keys,
          );
          if (selections === node.selections) {
            return node;
          }
          if (!selections.length) {
            return null;
          }
          return {
            kind: Kind.SELECTION_SET,
            selections,
          };
        },
      },
    }),
  );
}

function filterComputedSelections(
  selections: readonly SelectionNode[],
  computed: Set<string>,
  keyFields: FieldNode[] | undefined,
): SelectionNode[] {
  let strippedComputed = false;
  // Only unaliased fields satisfy literal merge-key identity. An aliased
  // `aliasId: id` must not suppress injecting the real `id` key field.
  const presentUnaliased = new Set<string>();
  const next: SelectionNode[] = [];
  for (const selection of selections) {
    if (selection.kind === Kind.FIELD) {
      if (computed.has(selection.name.value)) {
        strippedComputed = true;
        continue;
      }
      if (selection.alias == null) {
        presentUnaliased.add(selection.name.value);
      }
    }
    next.push(selection);
  }
  if (!strippedComputed) {
    return selections as SelectionNode[];
  }
  // Isolation's schema-strip makes prepareGatewayDocument inject key +
  // __typename deps. We kept the field on the schema (fast path skips that),
  // so restore identity fields here when a computed leaf was the only pick.
  if (!presentUnaliased.has('__typename')) {
    next.unshift({
      kind: Kind.FIELD,
      name: { kind: Kind.NAME, value: '__typename' },
    });
    presentUnaliased.add('__typename');
  }
  if (keyFields) {
    for (const keyField of keyFields) {
      if (
        !presentUnaliased.has(keyField.name.value) &&
        !computed.has(keyField.name.value)
      ) {
        next.push(keyField);
        presentUnaliased.add(keyField.name.value);
      }
    }
  }
  return next;
}

/** Top-level FieldNodes from a merge key selectionSet (nested children kept). */
function collectKeyFieldNodes(
  schema: GraphQLSchema,
  typeName: string,
  selectionSetStr: string | undefined,
): FieldNode[] {
  if (!selectionSetStr) {
    return [];
  }
  const type = schema.getType(typeName);
  if (!type || !isObjectType(type)) {
    return [];
  }
  const parsed = parseSelectionSet(selectionSetStr, { noLocation: true });
  const collected = collectFields(
    schema,
    {},
    getVariableValues(undefined),
    type,
    parsed,
  );
  const fields: FieldNode[] = [];
  for (const [, nodes] of collected.fields) {
    const first = nodes[0];
    if (first != null) {
      fields.push(first);
    }
  }
  return fields;
}

function mergeKeyFieldNodes(into: Map<string, FieldNode>, nodes: FieldNode[]) {
  for (const node of nodes) {
    const existing = into.get(node.name.value);
    if (existing == null) {
      into.set(node.name.value, node);
      continue;
    }
    // Prefer the selection that carries nested children when both exist.
    if (node.selectionSet != null && existing.selectionSet == null) {
      into.set(node.name.value, node);
    }
  }
}

/**
 * Replace isolation cloning with a single-subschema request deferral for
 * computed fields (`computed: true` + `selectionSet`).
 */
export function deferComputedFieldsTransformer(
  subschemaConfig: SubschemaConfig,
): Array<SubschemaConfig> {
  if (subschemaConfig.merge == null) {
    return [subschemaConfig];
  }

  const computedByType = new Map<string, Set<string>>();
  const keyFieldsByType = new Map<string, FieldNode[]>();
  const mergeEntryFieldNames = new Set<string>();
  const schema = subschemaConfig.schema;

  for (const typeName in subschemaConfig.merge) {
    const mergedTypeConfig = subschemaConfig.merge[typeName]!;
    if (mergedTypeConfig.fieldName) {
      mergeEntryFieldNames.add(mergedTypeConfig.fieldName);
    }
    for (const entry of mergedTypeConfig.entryPoints ?? []) {
      if (entry.fieldName) {
        mergeEntryFieldNames.add(entry.fieldName);
      }
    }

    const keys = new Map<string, FieldNode>();
    mergeKeyFieldNodes(
      keys,
      collectKeyFieldNodes(schema, typeName, mergedTypeConfig.selectionSet),
    );
    for (const entry of mergedTypeConfig.entryPoints ?? []) {
      mergeKeyFieldNodes(
        keys,
        collectKeyFieldNodes(schema, typeName, entry.selectionSet),
      );
    }
    if (keys.size) {
      keyFieldsByType.set(typeName, [...keys.values()]);
    }

    if (!mergedTypeConfig.fields) {
      continue;
    }
    let computed: Set<string> | undefined;
    for (const fieldName in mergedTypeConfig.fields) {
      const fieldConfig = mergedTypeConfig.fields[fieldName];
      if (fieldConfig?.computed && fieldConfig.selectionSet) {
        computed ||= new Set();
        computed.add(fieldName);
      }
    }
    if (computed?.size) {
      computedByType.set(typeName, computed);
    }
  }

  if (!computedByType.size) {
    return [subschemaConfig];
  }

  const transform = new DeferComputedFieldsTransform(
    schema,
    computedByType,
    keyFieldsByType,
    mergeEntryFieldNames,
  );
  return [
    {
      ...subschemaConfig,
      transforms: [transform, ...(subschemaConfig.transforms ?? [])],
    },
  ];
}
