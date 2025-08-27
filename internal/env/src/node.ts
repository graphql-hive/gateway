import os from 'node:os';

/**
 * Returns `true` if the OS platform is one of the provided {@link platforms}. */
export function isPlatform(...platforms: NodeJS.Platform[]): boolean {
  return platforms.includes(os.platform());
}

/**
 * Returns `true` if the OS platform is not any of the provided {@link platforms}.
 */
export function isNotPlatform(...platforms: NodeJS.Platform[]): boolean {
  const p = os.platform();
  for (const andNot of platforms) {
    if (p === andNot) {
      return false;
    }
  }
  return true;
}

/** Returns `true` if the runtime environment is Node.js. */
export function isNode() {
  return (
    typeof process !== 'undefined' && process.versions && process.versions.node
  );
}
