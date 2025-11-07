export interface EnvOptions {
  /**
   * The global object to use to get the environment variables.
   *
   * @default globalThis
   */
  globalThis?: Record<string, any>;
}

/**
 * Gets an environment variable isomorphically respecting the conventional place
 * JavaScript runtimes store the environment variables.
 *
 * @returns `undefined` if the variable is not set, or the trimmed string value of the variable.
 */
export function getEnvStr(
  key: string,
  opts: EnvOptions = {},
): string | undefined {
  const globalThat = opts.globalThis ?? globalThis;
  let variable: string | undefined =
    globalThat.process?.env?.[key] ||
    // @ts-expect-error can exist in wrangler and maybe other runtimes
    globalThat.env?.[key] ||
    // @ts-expect-error can exist in deno
    globalThat.Deno?.env?.get(key) ||
    // @ts-expect-error could be
    globalThat[key];
  if (variable != null) {
    variable += ''; // ensure it's a string
  } else {
    variable = undefined; // ensure it's undefined if not set
  }
  return variable?.trim();
}

/**
 * {@link getEnvStr Gets an environment variable string} and parses it as a number.
 *
 * @returns `undefined` if the variable is not set, `null` if it is not a number.
 */
export function getEnvNum(
  key: string,
  opts: EnvOptions = {},
): number | undefined | null {
  const variable = getEnvStr(key, opts);
  if (variable == null) return undefined;
  const num = parseFloat(variable);
  if (isNaN(num)) return null;
  return num;
}

/**
 * Parses the {@link getEnvStr environment variable} as a {@link strToBool truthy string}.
 *
 * Truthy values are (case-insensitive):
 *   - `1`
 *   - `true`
 *   - `t`
 *   - `yes`
 *   - `y`
 *   - `on`
 *   - `enabled`
 *
 * @returns `true` if the variable is set and is a truthy string, `false` otherwise.
 */
export function getEnvBool(key: string, opts: EnvOptions = {}): boolean {
  return strToBool(getEnvStr(key, opts));
}

/**
 * Gets the NODE_ENV environment variable.
 *
 * @returns Commonly 'development', 'production', 'test'; uncommonly a custom string if NODE_ENV is set to something else, or `undefined` if not set.
 */
export function getNodeEnv(
  opts: EnvOptions = {},
): 'development' | 'production' | 'test' | string | undefined {
  return getEnvStr('NODE_ENV', opts);
}

/**
 * Converts the {@link string str} to a truthy boolean.
 *
 * Truthy values are (case-insensitive):
 *   - `1`
 *   - `true`
 *   - `t`
 *   - `yes`
 *   - `y`
 *   - `on`
 *   - `enabled`
 *
 * @returns `true` if the string is a truthy string, `false` otherwise.
 */
export function strToBool(str: string | undefined): boolean {
  return ['1', 't', 'true', 'y', 'yes', 'on', 'enabled'].includes(
    (str || '').toLowerCase(),
  );
}

/**
 * Checks whether the `DEBUG` environment variable is {@link truthy truthyEnv}.
 */
export function isDebug(): boolean {
  return getEnvBool('DEBUG');
}

/** Checks whether the `CI` environment variable is {@link truthy truthyEnv}. */
export function isCI(): boolean {
  return getEnvBool('CI');
}

/** Returns `true` if the runtime environment is Node.js. */
export function isNode() {
  return (
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.node &&
    typeof Bun === 'undefined' // Bun also has process.versions.node
  );
}

/** Returns `true` if the runtime environment is a browser. */
export function isBrowser() {
  return typeof window !== 'undefined';
}

/**
 * Returns the Node.js version of the process.
 *
 * Will return `NaN` for every semver part if NOT Node.js. It's easeir to use `NaN` because all
 * number comparisons will return false (NaN > 22 = false; NaN < 22 = false).
 */
export function getNodeVer(): {
  major: number;
  minor: number;
  patch: number;
} {
  if (!isNode()) return { major: NaN, minor: NaN, patch: NaN };
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  return { major: major || NaN, minor: minor || NaN, patch: patch || NaN };
}

/**
 * Whether the federation query planner is using Hive Router node-addon for query planning.
 * @experimental
 */
export function usingHiveRouterRuntime(): boolean {
  // @ts-expect-error - pkgroll needs this for dead code elimination
  return process.env.HIVE_ROUTER_RUNTIME === '1';
}
