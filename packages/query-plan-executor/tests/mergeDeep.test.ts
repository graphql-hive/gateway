import { mergeDeep as expectedMergeDeep } from '@graphql-tools/utils';
import { expect, it } from 'vitest';
import { mergeDeep as actualMergeDeep } from '../src/utils/mergeDeep';

it('should merge arrays like graphql tools does', () => {
  const merge = [
    [{ a: 1 }, { b: 2 }, { c: 3 }],
    [{ a: 0, b: 1 }, { b: 3, c: 4 }, { d: 5 }],
  ];
  expect(actualMergeDeep(merge[0], merge[1])).toEqual(
    expectedMergeDeep(merge, undefined, true, true),
  );
});

it('should merge objects deeply like graphql tools does', () => {
  const merge = [
    {
      a: {
        b: 1,
        c: [{ a: 1 }, { b: 2 }, { c: 3 }],
        d: {
          e: 'hello',
        },
      },
      f: 42,
    },
    {
      a: {
        b: 2,
        c: [{ a: 0, b: 1 }, { b: 3, c: 4 }, { d: 5 }],
        d: {
          g: 'world',
        },
      },
      h: true,
    },
  ];
  expect(actualMergeDeep(merge[0], merge[1])).toEqual(
    expectedMergeDeep(merge, undefined, true, true),
  );
});
