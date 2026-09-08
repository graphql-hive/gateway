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

/** Any value `__SchemaDefinition` may resolve to. */
export type SchemaDefinitionValue =
  | GraphQLNamedType
  | GraphQLField<unknown, unknown>
  | GraphQLInputField
  | GraphQLEnumValue
  | GraphQLDirective;

/**
 * Look up the schema element addressed by a coordinate. Supports
 * `TypeName`, `TypeName.member`, and `@directiveName`. Returns `null` when
 * the coordinate does not resolve.
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

/** Filter context for the agent-facing surface — drops deprecated members and empty-after-filter types. */
export interface LookupFilter {
  excludeDeprecated: boolean;
  emptyTypes: ReadonlySet<string>;
}

/**
 * Look up a coordinate, returning `null` if it resolves to a `@deprecated`
 * member (when `excludeDeprecated` is set) or to a type that is empty
 * after the filter. Non-cascading: a field whose return type is empty is
 * itself returned.
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

function isDeprecatedMember(value: SchemaDefinitionValue): boolean {
  // graphql-js sets `deprecationReason` to a string whenever `@deprecated`
  // is applied — including the explicit empty-string form
  // `@deprecated(reason: "")`. Truthiness checks would mis-class those.
  const v = value as { deprecationReason?: string | null };
  return typeof v.deprecationReason === 'string';
}

/**
 * Resolve the `__SchemaDefinition` union variant for a runtime value.
 * Duck-typed on graphql-js's plain-object shapes, since `GraphQLField`,
 * `GraphQLInputField`, and `GraphQLEnumValue` aren't class instances.
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

  const v = value as { args?: unknown; value?: unknown; type?: unknown };
  if (Array.isArray(v.args)) {
    return '__Field';
  }
  if ('value' in v && v.type === undefined) {
    return '__EnumValue';
  }
  if (v.type !== undefined) {
    return '__InputValue';
  }
  return undefined;
}
