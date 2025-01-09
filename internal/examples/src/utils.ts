import fs from 'node:fs/promises';
import path from 'node:path';
import { ASTNode, ASTPath } from 'jscodeshift';

/** Checks whether a file exists at the given {@link path}. */
export function exists(path: string) {
  return fs
    .stat(path)
    .then(() => true)
    .catch(() => false);
}

export function defer(cb: () => any) {
  return {
    [Symbol.dispose]: cb,
  };
}

export function asyncDefer(cb: () => Promise<any>) {
  return {
    [Symbol.asyncDispose]: cb,
  };
}

/** Gets the Line Of Code numbers (with optional column number) in format `L0:0`. */
export function loc(pathOrNode: ASTPath | ASTNode, includeColumn?: true) {
  const node = 'node' in pathOrNode ? pathOrNode.node : pathOrNode;
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

/** Writes the the {@link file} creating all directories leading to it. */
export async function writeFileMkdir(file: string, contents: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
}

/** Copies the {@link from file} to the {@link to destination} creating all directories leading to it. */
export async function copyMkdir(from: string, to: string) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
}
