import { fakePromise, handleMaybePromise } from '@whatwg-node/promise-helpers';
import { buildSchema, GraphQLResolveInfo } from 'graphql';
import { describe, expect, it } from 'vitest';
import { annotateExternalObject } from '../src/mergeFields.js';
import { resolveExternalValue } from '../src/resolveExternalValue.js';

const schema = buildSchema(`
  interface Node { id: ID! }
  type Row implements Node { id: ID! }
  type Query { row: Row }
`);
const factories: Record<string, (trace: string[]) => any> = {
  plain: () => ({ id: '1' }),
  native: () => Promise.resolve({ id: '1' }),
  rejection: () => Promise.reject(new Error('expected rejection')),
  fake: () => fakePromise({ id: '1' }),
  'fake rejection': () =>
    fakePromise().then(() => {
      throw new Error('fake rejection');
    }),
  thenable: (trace) => ({
    then(resolve: (value: unknown) => unknown) {
      trace.push('then');
      return resolve({ id: '1' });
    },
  }),
  'throwing thenable': (trace) => ({
    then() {
      trace.push('then');
      throw new Error('then error');
    },
  }),
  'throwing then getter': () => ({
    get then() {
      throw new Error('getter error');
    },
  }),
  'noncallable then': () => ({ then: 1 }),
  'unknown type': () => ({ __typename: 'Unknown' }),
  'typename getter': (trace) => ({
    get __typename() {
      trace.push('get typename');
      return 'Row';
    },
  }),
};

describe('composite completion compatibility', () => {
  for (const markerValue of [undefined, 'resolved', 'rejected']) {
    it(`returns a synchronous object without reading inherited fake markers (${markerValue})`, () => {
      const marker = Symbol.for('@whatwg-node/promise-helpers/FakePromise');
      const trace: string[] = [];
      let thenReads = 0;
      const input = {
        get then() {
          trace.push('then');
          return ++thenReads > 2
            ? (resolve: (value: number) => unknown) => resolve(1)
            : undefined;
        },
      };
      let result;
      try {
        Object.defineProperty(Object.prototype, marker, {
          configurable: true,
          get() {
            trace.push('marker');
            return markerValue;
          },
        });
        // The synchronous fast path does not normalize an ordinary object through
        // helper wrappers or interpret markers inherited from a polluted global.
        result = resolveExternalValue(
          input,
          [],
          schema,
          undefined,
          undefined,
          schema.getQueryType()!.getFields()['row']!.type,
          true,
        );
      } finally {
        Reflect.deleteProperty(Object.prototype, marker);
      }
      expect(result).toBe(input);
      expect(trace).toEqual(['then']);
      expect(thenReads).toBe(1);
    });
  }

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
      expect(result.id).toBe('1');
    });
  }

  for (const [name, factory] of Object.entries(factories)) {
    for (const abstract of [false, true]) {
      it(`${name}, ${abstract ? 'abstract' : 'concrete'} type`, async () => {
        const type = schema.getType(abstract ? 'Node' : 'Row')!;
        const info = { schema, returnType: type } as GraphQLResolveInfo;
        const outputs = [];
        for (const legacy of [true, false]) {
          const trace: string[] = [];
          try {
            const input = factory(trace);
            const result = legacy
              ? handleMaybePromise(
                  () =>
                    annotateExternalObject(
                      input,
                      [],
                      schema,
                      Object.create(null),
                    ),
                  (value: any) => {
                    if (
                      abstract &&
                      value.__typename != null &&
                      !schema.getType(value.__typename)
                    )
                      return null;
                    return value;
                  },
                )
              : resolveExternalValue(
                  input,
                  [],
                  schema,
                  undefined,
                  info,
                  undefined,
                  true,
                );
            const synchronous = !result?.then;
            outputs.push({ result: await result, synchronous, trace });
          } catch (error) {
            outputs.push({ error: (error as Error).message, trace });
          }
        }
        expect(outputs[1]).toEqual(outputs[0]);
      });
    }
  }

  it('returns the same object synchronously and annotates it only once', () => {
    const input = { id: '1' };
    const type = schema.getQueryType()!.getFields()['row']!.type;
    const result = resolveExternalValue(
      input,
      [],
      schema,
      undefined,
      undefined,
      type,
      true,
    );
    const descriptors = Object.getOwnPropertyDescriptors(input);
    expect(result).toBe(input);
    expect(
      resolveExternalValue(input, [], schema, undefined, undefined, type, true),
    ).toBe(input);
    expect(Object.getOwnPropertyDescriptors(input)).toEqual(descriptors);
  });
});
