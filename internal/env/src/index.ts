/** An environment variable in _any_ JavaScript environment. */
export interface Env<V extends string | undefined> {
  /** The key of the environment variable. */
  key: string;
  /**
   * The value of the environment variable.
   * Is `undefined` if the environment variable is not set.
   */
  var: V;
  /**
   * Ensures the environment variable is set, if it is not set, it throws an error.
   */
  must(): Env<NonNullable<V>>;
  /**
   * Parses the {@link var variable} as a truthy boolean.
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
  truthy(): boolean;
}

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
 */
export function env(key: string, opts: EnvOptions = {}) {
  const globalThat = opts.globalThis ?? globalThis;
  let variable =
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
  const env: Env<string | undefined> = {
    get key() {
      return key;
    },
    get var() {
      return variable;
    },
    must() {
      if (variable == null) {
        throw new EnvError(`Environment variable "${key}" is not set`);
      }
      return env as Env<string>;
    },
    truthy() {
      return ['1', 't', 'true', 'y', 'yes', 'on', 'enabled'].includes(
        (variable || '').trim().toLowerCase(),
      );
    },
  };
  return env;
}

export class EnvError extends Error {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'EnvError';
  }
}
