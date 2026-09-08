import type { VariableValues } from '@graphql-tools/utils';

type VersionedVariableValues =
  | Record<string, unknown>
  | VariableValues<Record<string, unknown>>
  | undefined;

/**
 * Returns the runtime variable values, regardless of the graphql-js version.
 *
 * - graphql <=16: `info.variableValues` is a flat `{ [name]: value }` map.
 * - graphql >=17: `info.variableValues` is `{ sources, coerced }`; the runtime
 *   values live under `.coerced`.
 */
export function getCoercedVariableValues(
  variableValues: VersionedVariableValues,
): Record<string, unknown> | undefined {
  if (variableValues == null) {
    return undefined;
  }
  // Detect the v17 wrapper by requiring BOTH keys, so a flat map that merely
  // declares a variable named `coerced` is not mistaken for the wrapper.
  if (
    Object.hasOwn(variableValues, 'coerced') &&
    Object.hasOwn(variableValues, 'sources')
  ) {
    return (variableValues as VariableValues<Record<string, unknown>>).coerced;
  }
  return variableValues as Record<string, unknown>;
}

export function getVariableValues(
  variableValues: VersionedVariableValues,
): VariableValues<Record<string, unknown>> {
  if (
    variableValues != null &&
    Object.hasOwn(variableValues, 'coerced') &&
    Object.hasOwn(variableValues, 'sources')
  ) {
    return variableValues as VariableValues<Record<string, unknown>>;
  }
  return {
    coerced: (variableValues ?? {}) as Record<string, unknown>,
    sources: {},
  };
}
