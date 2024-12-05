import { memoize1 } from '@graphql-tools/utils';
import { DocumentNode, print, stripIgnoredCharacters } from 'graphql';

export const defaultPrintFn = memoize1(function defaultPrintFn(
  document: DocumentNode,
) {
  return stripIgnoredCharacters(print(document));
});
