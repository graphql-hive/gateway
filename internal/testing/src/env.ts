import os from 'node:os';

/**
 * Checks whether the `DEBUG` environment variable is truthy.
 * If the {@link module} is provided, then the debug will only
 * be activated for the specific module in code.
 *
 * For example, `isDebug('loadtest')` will only activate when the enviorment
 * variable `DEBUG_loadtest` is set to a truthy value.
 */
export function isDebug(module?: string) {
  if (module) {
    return boolEnv(`DEBUG_${module}`);
  }
  return boolEnv('DEBUG');
}

/** Checks whether the `CI` environment variable is truthy. */
export function isCI() {
  return boolEnv('CI');
}

/** Checks if the environment variable with {@link name} is truthy. */
export function boolEnv(name: string) {
  return strToBool(String(process.env[name]));
}

/**
 * Parses the string to a truthy value.
 *
 * String values considered truthy are:
 * - 1
 * - t
 * - true
 * - y
 * - yes
 */
export function strToBool(val: string) {
  return ['1', 't', 'true', 'y', 'yes'].includes(val);
}

/** Returns `true` if the OS platform is one of the provided {@link platforms}. */
export function isPlatform(...platforms: NodeJS.Platform[]): boolean {
  return platforms.includes(os.platform());
}

/** Returns `true` if the OS platform is not any of the provided {@link platforms}. */
export function isNotPlatform(...platforms: NodeJS.Platform[]): boolean {
  const p = os.platform();
  for (const andNot of platforms) {
    if (p === andNot) {
      return false;
    }
  }
  return true;
}
