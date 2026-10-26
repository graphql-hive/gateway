import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { annotateExternalObject, getSubschema } from '../src/mergeFields.js';
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

  it('keeps descriptor state local across reentrant Proxy traps', () => {
    const nested = {},
      nestedMap = Object.create(null),
      outerMap = Object.create(null);
    const target = {};
    let calls = 0;
    const proxy = new Proxy(target, {
      defineProperty(object, key, descriptor) {
        if (++calls === 1)
          annotateExternalObject(nested, [], undefined, nestedMap);
        return Reflect.defineProperty(object, key, descriptor);
      },
    });
    const result = annotateExternalObject(proxy, [], schema, outerMap);
    expect(result[F]).toBe(outerMap);
    expect(result[S]).toBe(schema);
    expect(Object.getOwnPropertyDescriptor(nested, F)!.value).toBe(nestedMap);
    expect(Object.getOwnPropertyDescriptor(nested, S)!.value).toBeUndefined();
  });

  for (const flag of ['enumerable', 'configurable', 'get', 'set']) {
    for (const timing of ['before', 'during']) {
      it(`preserves inherited ${flag} descriptor behavior ${timing} annotation`, () => {
        const outcomes = [];
        for (const legacy of [true, false]) {
          const target = {},
            trace: string[] = [];
          let errorName;
          const contaminate = () =>
            Reflect.defineProperty(
              Object.prototype,
              flag,
              Object.setPrototypeOf(
                {
                  value:
                    flag === 'get' || flag === 'set' ? () => undefined : true,
                  configurable: true,
                },
                null,
              ),
            );
          const proxy = new Proxy(target, {
            defineProperty(object, key, descriptor) {
              Object.setPrototypeOf(descriptor, null);
              trace.push(String(key));
              const result = Reflect.defineProperty(object, key, descriptor);
              if (timing === 'during' && trace.length === 1) contaminate();
              return result;
            },
          });
          try {
            if (timing === 'before') contaminate();
            if (legacy)
              Object.defineProperties(proxy, {
                [S]: { value: schema, writable: true },
                [F]: { value: undefined, writable: true },
                [E]: { value: undefined, writable: true },
              });
            else
              annotateExternalObject(
                proxy,
                undefined as never,
                schema,
                undefined as never,
              );
          } catch (error) {
            errorName = (error as Error).name;
          } finally {
            Reflect.deleteProperty(Object.prototype, flag);
          }
          outcomes.push({
            errorName,
            trace,
            descriptors: Object.getOwnPropertyDescriptors(target),
          });
        }
        expect(outcomes[1]).toEqual(outcomes[0]);
      });
    }
  }
});
