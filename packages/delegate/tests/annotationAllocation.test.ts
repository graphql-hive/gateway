import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { resolveExternalValue } from '../src/resolveExternalValue.js';
import { FIELD_SUBSCHEMA_MAP_SYMBOL } from '../src/symbols.js';

const schema = buildSchema('type Query { row: Row } type Row { id: ID }');

describe('external object annotation allocation', () => {
  it('uses an extensible null-prototype field subschema map', () => {
    const object = resolveExternalValue(
      { id: '1' },
      [],
      schema,
      undefined,
      undefined,
      schema.getQueryType()!.getFields()['row']!.type,
      true,
    );
    const map = object[FIELD_SUBSCHEMA_MAP_SYMBOL];
    expect(Object.getPrototypeOf(map)).toBeNull();
    expect(Object.isExtensible(map)).toBe(true);
  });
});
