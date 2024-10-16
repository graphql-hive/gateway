/** Checks whether the `DEBUG` environment variable is truthy. */
export function isDebug() {
  return ['1', 'y', 'yes', 't', 'true'].includes(String(process.env['DEBUG']));
}
