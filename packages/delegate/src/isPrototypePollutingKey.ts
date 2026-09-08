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
