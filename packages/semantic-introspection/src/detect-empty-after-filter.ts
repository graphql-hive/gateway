import {
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isUnionType,
  type GraphQLSchema,
} from 'graphql';

export interface DetectEmptyAfterFilterOptions {
  /**
   * Treat `@deprecated` fields, enum values, and input fields as filtered
   * out when deciding whether a type is empty. When `false` (default),
   * every type is treated as non-empty (no filter is applied) and the
   * result is an empty set.
   */
  excludeDeprecated?: boolean;
}

/** Why a type ended up classified as empty-after-filter. */
export type EmptyReason =
  | 'all-fields-deprecated'
  | 'all-input-fields-deprecated'
  | 'all-enum-values-deprecated'
  | 'all-union-members-empty'
  | 'all-interface-fields-deprecated';

export interface DetectEmptyAfterFilterResult {
  /** Names of types that are empty under the given filter. */
  readonly emptyTypes: ReadonlySet<string>;
  /** Why each empty type was so classified. */
  readonly reasons: ReadonlyMap<string, EmptyReason>;
}

/**
 * Identify the set of types that would be left empty by an agent-facing
 * filter — specifically, types whose own member content fails the GraphQL
 * spec's "≥ 1" rule for their Kind once filtered.
 *
 * Rules per Kind:
 *  - Object / Interface: zero non-deprecated fields → empty.
 *  - Input object: zero non-deprecated fields → empty.
 *  - Enum: zero non-deprecated values → empty.
 *  - Union: zero non-empty members → empty (recursive; resolved via
 *    fixed-point iteration).
 *  - Scalar: never empty.
 *
 * Used by `__definitions` to decide which coordinates to omit (returning
 * `__Type` with `fields: []` would violate the introspection validity
 * contract), and exported publicly so downstream consumers (e.g. an ACL
 * package that physically rewrites the SDL) can drive their own
 * delete-or-cascade decisions.
 *
 * Non-cascading on references: a non-deprecated field whose return type
 * is empty-after-filter is NOT itself classified as empty — that's a
 * deliberate design choice (see the locked Phase 3 design).
 */
export function detectEmptyAfterFilter(
  schema: GraphQLSchema,
  options: DetectEmptyAfterFilterOptions = {},
): DetectEmptyAfterFilterResult {
  const excludeDeprecated = options.excludeDeprecated === true;
  if (!excludeDeprecated) {
    return EMPTY_RESULT;
  }

  const emptyTypes = new Set<string>();
  const reasons = new Map<string, EmptyReason>();

  const types = Object.values(schema.getTypeMap()).filter(
    (t) => !t.name.startsWith('__'),
  );

  // Fixed-point: union emptiness depends on the emptiness of its members,
  // which may themselves get classified during this pass.
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
          (f) => !f.deprecationReason,
        );
        if (surviving.length === 0) {
          reason = 'all-fields-deprecated';
        }
      } else if (isInterfaceType(type)) {
        const surviving = Object.values(type.getFields()).filter(
          (f) => !f.deprecationReason,
        );
        if (surviving.length === 0) {
          reason = 'all-interface-fields-deprecated';
        }
      } else if (isInputObjectType(type)) {
        const surviving = Object.values(type.getFields()).filter(
          (f) => !f.deprecationReason,
        );
        if (surviving.length === 0) {
          reason = 'all-input-fields-deprecated';
        }
      } else if (isEnumType(type)) {
        const surviving = type.getValues().filter((v) => !v.deprecationReason);
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

const EMPTY_RESULT: DetectEmptyAfterFilterResult = {
  emptyTypes: new Set<string>(),
  reasons: new Map<string, EmptyReason>(),
};
