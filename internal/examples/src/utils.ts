import fs from 'node:fs/promises';

/** Checks whether a file exists at the given {@link path}. */
export function exists(path: string) {
  return fs
    .stat(path)
    .then(() => true)
    .catch(() => false);
}
