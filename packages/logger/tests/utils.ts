/** Stabilises the error for snapshot testing */
export function stableError<T extends Error>(err: T): T {
  if (globalThis.Bun) {
    // bun serialises errors differently from node
    // we need to remove some properties to make the snapshots match
    // @ts-expect-error
    delete err.column;
    // @ts-expect-error
    delete err.line;
    // @ts-expect-error
    delete err.originalColumn;
    // @ts-expect-error
    delete err.originalLine;
    // @ts-expect-error
    delete err.sourceURL;
  }
  // we remove the stack to make the snapshot stable
  err.stack = '<stack>';
  return err;
}
