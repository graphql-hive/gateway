import { getDocumentString } from '@envelop/core';
import { memoize1 } from '@graphql-tools/utils';
import { print, stripIgnoredCharacters, type DocumentNode } from 'graphql';

export type * from './types';
export * from './ObjMap';
export { createDefaultExecutor } from '@graphql-tools/delegate';
export { getDocumentString } from '@envelop/core';
export const defaultPrintFn = memoize1(function defaultPrintFn(
  document: DocumentNode,
) {
  return stripIgnoredCharacters(getDocumentString(document, print));
});
