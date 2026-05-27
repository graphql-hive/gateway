import {
  isDirective,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isNamedType,
  isObjectType,
  type GraphQLDirective,
  type GraphQLEnumValue,
  type GraphQLField,
  type GraphQLInputField,
  type GraphQLNamedType,
  type GraphQLSchema,
} from 'graphql';
import type { SchemaCoordinate } from './provider.js';

/** Any value our `__SchemaDefinition` union may resolve to. */
export type SchemaDefinitionValue =
  | GraphQLNamedType
  | GraphQLField<unknown, unknown>
  | GraphQLInputField
  | GraphQLEnumValue
  | GraphQLDirective;

/**
 * Look up the schema element addressed by a coordinate.
 *
 * Supported coordinate forms:
 *  - `TypeName` — a named type (Object/Interface/Union/Enum/InputObject/Scalar).
 *  - `TypeName.member` — a field on an Object/Interface, an input field on
 *     an InputObject, or a value on an Enum.
 *  - `@directiveName` — a directive.
 *
 * Returns `null` when the coordinate does not resolve to any element.
 */
export function lookupCoordinate(
  schema: GraphQLSchema,
  coordinate: SchemaCoordinate,
): SchemaDefinitionValue | null {
  if (coordinate.startsWith('@')) {
    return schema.getDirective(coordinate.slice(1)) ?? null;
  }

  const dot = coordinate.indexOf('.');
  if (dot < 0) {
    return schema.getType(coordinate) ?? null;
  }

  const typeName = coordinate.slice(0, dot);
  const memberName = coordinate.slice(dot + 1);
  const type = schema.getType(typeName);
  if (!type) {
    return null;
  }

  if (isObjectType(type) || isInterfaceType(type) || isInputObjectType(type)) {
    return type.getFields()[memberName] ?? null;
  }
  if (isEnumType(type)) {
    return type.getValue(memberName) ?? null;
  }
  return null;
}

/**
 * Filter context applied to coordinate lookups in the agent-facing
 * surface — drops deprecated members and empty-after-filter types.
 */
export interface LookupFilter {
  /** True when `@deprecated` members should be dropped from results. */
  readonly excludeDeprecated: boolean;
  /** Names of types that are empty-after-filter and should be omitted. */
  readonly emptyTypes: ReadonlySet<string>;
}

/**
 * Look up a coordinate and apply the agent-facing filter:
 *  - if the value is a `@deprecated` field / enum value / input field and
 *    `excludeDeprecated` is true → return `null`.
 *  - if the value is a named type whose surface would be empty after the
 *    filter (from {@link detectEmptyAfterFilter}) → return `null`.
 *    (Emitting `__Type` with `fields: []` would violate the introspection
 *    validity contract.)
 *
 * Non-cascading: a non-deprecated field whose return type is empty-after-
 * filter is itself returned. The agent sees the field but its type is
 * effectively opaque (no agent-visible members).
 */
export function filteredLookup(
  schema: GraphQLSchema,
  coordinate: SchemaCoordinate,
  filter: LookupFilter,
): SchemaDefinitionValue | null {
  const value = lookupCoordinate(schema, coordinate);
  if (value === null) {
    return null;
  }

  if (filter.excludeDeprecated && isDeprecatedMember(value)) {
    return null;
  }

  if (isNamedType(value) && filter.emptyTypes.has(value.name)) {
    return null;
  }

  return value;
}

/**
 * `@deprecated` may apply to a field, enum value, input field, or argument
 * — all of which expose `deprecationReason: string | null` in graphql-js.
 * Named types and directives never carry it.
 */
function isDeprecatedMember(value: SchemaDefinitionValue): boolean {
  const v = value as { deprecationReason?: string | null };
  return (
    typeof v.deprecationReason === 'string' && v.deprecationReason.length > 0
  );
}

/**
 * Determine which member of the `__SchemaDefinition` union a runtime value
 * belongs to. Returns the type name (e.g. `'__Type'`) used by graphql-js's
 * `resolveType` for unions.
 *
 * Distinguishes by duck-typing on graphql-js's standard runtime shapes,
 * since `GraphQLField`, `GraphQLArgument`/`GraphQLInputField`, and
 * `GraphQLEnumValue` are plain objects rather than classes.
 */
export function resolveSchemaDefinitionType(
  value: unknown,
): string | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  if (isNamedType(value)) {
    return '__Type';
  }
  if (isDirective(value)) {
    return '__Directive';
  }

  const v = value as {
    args?: unknown;
    value?: unknown;
    type?: unknown;
  };

  // `GraphQLField` has an `args` array; `GraphQLDirective` would too but
  // is caught above by `isDirective`.
  if (Array.isArray(v.args)) {
    return '__Field';
  }
  // `GraphQLEnumValue` carries a runtime `.value` and never a `.type`.
  if ('value' in v && v.type === undefined) {
    return '__EnumValue';
  }
  // `GraphQLInputField` / `GraphQLArgument` carry a `.type`.
  if (v.type !== undefined) {
    return '__InputValue';
  }

  return undefined;
}
