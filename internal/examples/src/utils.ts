import fs from 'node:fs/promises';
import { ASTPath } from 'jscodeshift';

/** Checks whether a file exists at the given {@link path}. */
export function exists(path: string) {
  return fs
    .stat(path)
    .then(() => true)
    .catch(() => false);
}

export function defer(cb: () => void) {
  return {
    [Symbol.dispose]: cb,
  };
}

/** Gets the Line Of Code numbers (with optional column number) in format `L0:0`. */
export function loc({ node }: ASTPath, includeColumn?: true) {
  if (!('loc' in node)) {
    throw new Error('Node does not have a location in source');
  }
  if (!node.loc) {
    throw new Error('Node location in source is empty');
  }
  let str = `L${node.loc.start.line}`;
  if (includeColumn) {
    str += `:${node.loc.start.column}`;
  }
  return str;
}