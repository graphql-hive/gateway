/**
 * Returns the runtime variable values, regardless of the graphql-js version.
 *
 * - graphql <=16: `info.variableValues` is a flat `{ [name]: value }` map.
 * - graphql >=17: `info.variableValues` is `{ sources, coerced }`; the runtime
 *   values live under `.coerced`.
 */
export function getCoercedVariableValues(
  variableValues:
    | Record<string, unknown>
    | { coerced?: Record<string, unknown>; sources?: unknown }
    | undefined,
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
    return (variableValues as { coerced?: Record<string, unknown> }).coerced;
  }
  return variableValues as Record<string, unknown>;
}
