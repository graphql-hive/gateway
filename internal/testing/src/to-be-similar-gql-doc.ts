import { compareNodes } from '@graphql-tools/utils';
import { ASTNode, DefinitionNode, DocumentNode, parse, print } from 'graphql';
import { diff } from 'jest-diff';
import { expect } from 'vitest';

declare global {
  namespace jest {
    interface Matchers<R, T> {
      /**
       * Normalizes whitespace and performs string comparisons
       */
      toBeSimilarGqlDoc(expected: string): R;
    }
  }
}

function sortRecursive(a: ASTNode) {
  for (const attrStr in a) {
    const attr = attrStr as keyof ASTNode;
    const attrValue = a[attr];
    if (attrValue instanceof Array) {
      if (attrValue.length === 1) {
        sortRecursive(attrValue[0]);
      }
      attrValue.sort((b: ASTNode, c: ASTNode) => {
        sortRecursive(b);
        sortRecursive(c);
        return compareNodes(b, c);
      });
    }
  }
}

function normalizeDocumentString(docStr: string) {
  const doc = parse(docStr, { noLocation: true }) as DocumentNode & {
    definitions: DefinitionNode[];
  };
  sortRecursive(doc);
  return print(doc);
}

expect.extend({
  toBeSimilarGqlDoc(received: string, expected: string) {
    const strippedReceived = normalizeDocumentString(received);
    const strippedExpected = normalizeDocumentString(expected);

    if (strippedReceived.trim() === strippedExpected.trim()) {
      return {
        message: () =>
          `expected
       ${received}
       not to be a string containing (ignoring indents)
       ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => diff(strippedExpected, strippedReceived) || '',
        pass: false,
      };
    }
  },
});
