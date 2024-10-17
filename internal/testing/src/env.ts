/** Checks whether the `DEBUG` environment variable is truthy. */
export function isDebug() {
  return boolEnv('DEBUG');
}

/** Checks if the environment variable with {@link name} is truthy. */
export function boolEnv(name: string) {
  return ['1', 't', 'true', 'y', 'yes'].includes(String(process.env[name]));
}
