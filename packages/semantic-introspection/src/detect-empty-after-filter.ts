import {
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isUnionType,
  type GraphQLSchema,
} from 'graphql';

export interface DetectEmptyAfterFilterOptions {
  /** Treat `@deprecated` members as filtered out. When `false` (default) the result is empty. */
  excludeDeprecated?: boolean;
}

/** Why a type was classified as empty-after-filter. */
export type EmptyReason =
  | 'all-fields-deprecated'
  | 'all-input-fields-deprecated'
  | 'all-enum-values-deprecated'
  | 'all-union-members-empty'
  | 'all-interface-fields-deprecated';

export interface DetectEmptyAfterFilterResult {
  emptyTypes: ReadonlySet<string>;
  reasons: ReadonlyMap<string, EmptyReason>;
}

/**
 * Identify types whose own member content fails the GraphQL spec's "≥ 1"
 * rule for their Kind once `@deprecated` members are filtered out
 * (Object/Interface/Input zero non-deprecated fields, Enum zero
 * non-deprecated values, Union zero non-empty members — resolved via
 * fixed-point iteration; scalars never qualify). Non-cascading: a field
 * whose return type is empty-after-filter is not itself classified empty.
 */
export function detectEmptyAfterFilter(
  schema: GraphQLSchema,
  options: DetectEmptyAfterFilterOptions = {},
): DetectEmptyAfterFilterResult {
  const excludeDeprecated = options.excludeDeprecated === true;
  if (!excludeDeprecated) {
    // Fresh instance — a module-level shared object would leak across
    // callers if any of them mutate the returned Set/Map.
    return {
      emptyTypes: new Set<string>(),
      reasons: new Map<string, EmptyReason>(),
    };
  }

  const emptyTypes = new Set<string>();
  const reasons = new Map<string, EmptyReason>();

  const types = Object.values(schema.getTypeMap()).filter(
    (t) => !t.name.startsWith('__'),
  );

  // fixed-point for unions
  let changed = true;
  while (changed) {
    changed = false;

    for (const type of types) {
      if (emptyTypes.has(type.name)) {
        continue;
      }

      let reason: EmptyReason | undefined;

      if (isObjectType(type)) {
        const surviving = Object.values(type.getFields()).filter(
          (f) => typeof f.deprecationReason !== 'string',
        );
        if (surviving.length === 0) {
          reason = 'all-fields-deprecated';
        }
      } else if (isInterfaceType(type)) {
        const surviving = Object.values(type.getFields()).filter(
          (f) => typeof f.deprecationReason !== 'string',
        );
        if (surviving.length === 0) {
          reason = 'all-interface-fields-deprecated';
        }
      } else if (isInputObjectType(type)) {
        const surviving = Object.values(type.getFields()).filter(
          (f) => typeof f.deprecationReason !== 'string',
        );
        if (surviving.length === 0) {
          reason = 'all-input-fields-deprecated';
        }
      } else if (isEnumType(type)) {
        const surviving = type
          .getValues()
          .filter((v) => typeof v.deprecationReason !== 'string');
        if (surviving.length === 0) {
          reason = 'all-enum-values-deprecated';
        }
      } else if (isUnionType(type)) {
        const surviving = type
          .getTypes()
          .filter((m) => !emptyTypes.has(m.name));
        if (surviving.length === 0) {
          reason = 'all-union-members-empty';
        }
      }
      // Scalars: never empty (no member rule).

      if (reason) {
        emptyTypes.add(type.name);
        reasons.set(type.name, reason);
        changed = true;
      }
    }
  }

  return { emptyTypes, reasons };
}
