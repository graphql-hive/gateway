const prototypePollutingKeys = [
  '__proto__',
  'constructor',
  'prototype',
] as const;

type PrototypePollutingKey = (typeof prototypePollutingKeys)[number];

export function isPrototypePollutingKey(
  key: string,
): key is PrototypePollutingKey {
  // @ts-expect-error - typings are incorrect
  return prototypePollutingKeys.includes(key);
}

/**
 * Removes prototype polluting keys from the given value, in place and at every depth.
 *
 * Response data coming from a subgraph can contain keys such as `__proto__` or
 * `constructor` when the client aliases a field to one of those names. Deep merging
 * such data walks the prototype chain and can end up writing to `Object.prototype` or
 * `Function.prototype`, so the keys are dropped before any merge happens.
 */
export function removePrototypePollutingKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      removePrototypePollutingKeys(item);
    }
  } else if (value && typeof value === 'object' && !(value instanceof Error)) {
    for (const key of Object.keys(value)) {
      if (isPrototypePollutingKey(key)) {
        delete (value as Record<string, unknown>)[key];
      } else {
        removePrototypePollutingKeys((value as Record<string, unknown>)[key]);
      }
    }
  }
  return value;
}
