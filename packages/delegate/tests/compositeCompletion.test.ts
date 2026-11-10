import { buildSchema, GraphQLResolveInfo } from 'graphql';
import { describe, expect, it } from 'vitest';
import { resolveExternalValue } from '../src/resolveExternalValue.js';

const schema = buildSchema(`
  interface Node { id: ID! }
  type Row implements Node { id: ID! }
  type Query { row: Row }
`);

describe('composite completion', () => {
  for (const abstract of [false, true]) {
    it(`classifies a synchronous ${abstract ? 'abstract' : 'concrete'} object once`, () => {
      let thenReads = 0;
      const input = {
        id: '1',
        __typename: 'Row',
        get then() {
          thenReads++;
          return undefined;
        },
      };
      const type = schema.getType(abstract ? 'Node' : 'Row')!;
      const info = { schema, returnType: type } as GraphQLResolveInfo;
      const result = resolveExternalValue(
        input,
        [],
        schema,
        undefined,
        info,
        undefined,
        true,
      );
      expect(thenReads).toBe(1);
      expect(result).toBe(input);
    });
  }

  it('returns null for an abstract type with an unknown __typename', () => {
    const type = schema.getType('Node')!;
    const info = { schema, returnType: type } as GraphQLResolveInfo;
    expect(
      resolveExternalValue(
        { __typename: 'Unknown' },
        [],
        schema,
        undefined,
        info,
        undefined,
        true,
      ),
    ).toBeNull();
  });
});
