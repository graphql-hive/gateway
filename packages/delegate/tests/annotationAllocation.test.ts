import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { getSubschema } from '../src/mergeFields.js';
import { resolveExternalValue } from '../src/resolveExternalValue.js';
import {
  UNPATHED_ERRORS_SYMBOL as E,
  FIELD_SUBSCHEMA_MAP_SYMBOL as F,
  OBJECT_SUBSCHEMA_SYMBOL as S,
} from '../src/symbols.js';

const schema = buildSchema('type Query { row: Row } type Row { id: ID }');

describe('external object annotation allocation', () => {
  it('keeps fresh mutable null-prototype maps and writable hidden metadata', () => {
    let previous;
    for (let i = 0; i < 30; i++) {
      const object = resolveExternalValue(
        { id: '1' },
        [],
        schema,
        undefined,
        undefined,
        schema.getQueryType()!.getFields()['row']!.type,
        true,
      );
      const map = object[F];
      expect(Object.getPrototypeOf(map)).toBeNull();
      expect(Object.isExtensible(map)).toBe(true);
      expect(map).not.toBe(previous);
      for (const key of ['__proto__', 'constructor', 'toString']) {
        map[key] = schema;
        expect(getSubschema(object, key)).toBe(schema);
        delete map[key];
      }
      for (const symbol of [S, F, E]) {
        expect(Object.getOwnPropertyDescriptor(object, symbol)).toMatchObject({
          writable: true,
          enumerable: false,
          configurable: false,
        });
      }
      previous = map;
    }
  });
});
