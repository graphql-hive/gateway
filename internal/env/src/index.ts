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
 * It will make sure the variable is a string, if it is not set, it will
 * return `undefined`.
 *
 * If the variable is set, it will also trim the value removing any empty spaces.
 */
export function getEnv(key: string, opts: EnvOptions = {}) {
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
 * Parses the {@link getEnv environment variable} as a truthy boolean.
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
 * If the variable is not set or is any other string than truthy, it returns `false`.
 */
export function truthyEnv(key: string, opts: EnvOptions = {}) {
  return ['1', 't', 'true', 'y', 'yes', 'on', 'enabled'].includes(
    (getEnv(key, opts) || '').toLowerCase(),
  );
}
