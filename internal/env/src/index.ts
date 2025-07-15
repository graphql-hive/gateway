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
export function truthyEnv(key: string, opts: EnvOptions = {}): boolean {
  return strToBool(getEnvStr(key, opts));
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
  return truthyEnv('DEBUG');
}

/** Checks whether the `CI` environment variable is {@link truthy truthyEnv}. */
export function isCI(): boolean {
  return truthyEnv('CI');
}
