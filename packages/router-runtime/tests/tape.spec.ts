import { describe, expect, it } from 'vitest';
import {
  K_ARR,
  K_OBJ,
  quotedKey,
  ResponseTape,
  ResponseWriter,
} from '../src/tape';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function add(tape: ResponseTape, value: unknown) {
  return tape.add(encoder.encode(JSON.stringify(value)));
}

// like router-runtime's deepMerge, without custom scalars
function deepMerge(target: any, source: any): any {
  if (source == null || target === source) {
    return target ?? source;
  }
  if (
    target == null ||
    typeof target !== 'object' ||
    typeof source !== 'object' ||
    Array.isArray(target) !== Array.isArray(source)
  ) {
    return source;
  }
  if (Array.isArray(target)) {
    const length = Math.min(target.length, source.length);
    for (let i = 0; i < length; i++) {
      target[i] = deepMerge(target[i], source[i]);
    }
    return target;
  }
  for (const key in source) {
    target[key] = Object.hasOwn(target, key)
      ? deepMerge(target[key], source[key])
      : source[key];
  }
  return target;
}

describe('ResponseTape', () => {
  it('reads back what it tokenized', () => {
    const values = [
      { a: 1, b: 'two', c: [true, false, null], d: { e: -1.5e3, f: '' } },
      [[], {}, [{}], 'a"b\\cé\n', 0],
      'plain',
      12,
      null,
    ];
    for (const value of values) {
      const tape = new ResponseTape();
      expect(tape.read(add(tape, value))).toEqual(value);
    }
  });

  it('tokenizes JSON with whitespace like JSON.parse reads it', () => {
    const tape = new ResponseTape();
    const json = ' { "a" : [ 1 , { "b" : "x y" } ] ,\n\t"c": null } ';
    expect(tape.read(tape.add(encoder.encode(json)))).toEqual(JSON.parse(json));
  });

  it('finds short keys, and keys alike in all but one char', () => {
    const value = {
      '': 0,
      a: 1,
      ab: 2,
      abc: 3,
      abcd: 4,
      abce: 5,
      _e0: 6,
      _e1: 7,
      xbcd: 8,
    };
    const tape = new ResponseTape();
    const top = tape.add(encoder.encode(JSON.stringify(value)));
    for (const [key, expected] of Object.entries(value)) {
      expect(tape.read(tape.member(top, quotedKey(key))), key).toBe(expected);
    }
    // merged, the index finds them the same way
    const merged = add(tape, { extra: true });
    tape.link(top, merged);
    const index = tape.openIndex(top);
    for (const [key, expected] of Object.entries(value)) {
      expect(tape.read(tape.indexGet(index, quotedKey(key))), key).toBe(
        expected,
      );
    }
    expect(tape.read(tape.indexGet(index, quotedKey('extra')))).toBe(true);
    expect(tape.indexGet(index, quotedKey('abcf'))).toBe(-1);
    tape.closeIndex(index);
  });

  it('finds keys too long for an id by their bytes, alone and merged', () => {
    const long = 'k'.repeat(80);
    const value = { [long + 'a']: 1, [long + 'b']: 2, short: 3 };
    const tape = new ResponseTape();
    const top = add(tape, value);
    expect(tape.read(tape.member(top, quotedKey(long + 'b')))).toBe(2);
    expect(tape.member(top, quotedKey(long + 'c'))).toBe(-1);
    tape.link(top, add(tape, { [long + 'a']: 4, [long + 'c']: 5 }));
    const index = tape.openIndex(top);
    expect(tape.read(tape.indexGet(index, quotedKey(long + 'a')))).toBe(4);
    expect(tape.read(tape.indexGet(index, quotedKey(long + 'b')))).toBe(2);
    expect(tape.read(tape.indexGet(index, quotedKey(long + 'c')))).toBe(5);
    expect(tape.indexGet(index, quotedKey(long + 'd'))).toBe(-1);
    tape.closeIndex(index);
    expect(tape.read(top)).toEqual({
      ...value,
      [long + 'a']: 4,
      [long + 'c']: 5,
    });
  });

  it('finds every key by its hash, escaped ones and ones after nested lists too', () => {
    const value = {
      'a"b': 1,
      'c\\': {
        list: [{ inner: 'x' }, ['inner', 'list'], 'key-like'],
        after: 2,
      },
      é: 3,
      last: [[], {}],
    };
    const tape = new ResponseTape();
    const top = add(tape, value);
    expect(tape.read(top)).toEqual(value);
    expect(tape.read(tape.member(top, quotedKey('a"b')))).toBe(1);
    expect(tape.read(tape.member(top, quotedKey('é')))).toBe(3);
    const c = tape.member(top, quotedKey('c\\'));
    expect(tape.read(tape.member(c, quotedKey('after')))).toBe(2);
    // a string value is never taken for a key
    expect(tape.member(c, quotedKey('inner'))).toBe(-1);
    expect(tape.member(top, quotedKey('missing'))).toBe(-1);
  });

  it('finds the end of strings with escaped quotes and backslashes', () => {
    const value = {
      a: 'one \\" two',
      b: 'ends with a backslash \\',
      c: '\\\\"',
      d: '"',
      e: ['\\', '\\\\', 'x"y'],
    };
    const tape = new ResponseTape();
    expect(tape.read(add(tape, value))).toEqual(value);
  });

  it('finds the end of long strings at any alignment, with escapes anywhere in them', () => {
    const strings: string[] = [];
    for (let length = 0; length < 24; length++) {
      strings.push('x'.repeat(length));
      for (let at = 0; at < length; at++) {
        const chars = 'abcdefghijklmnopqrstuvwxyz'.slice(0, length).split('');
        chars[at] = at % 2 ? '"' : '\\';
        strings.push(chars.join(''));
      }
    }
    const json = encoder.encode(JSON.stringify({ s: strings }));
    for (let offset = 0; offset < 4; offset++) {
      const padded = new Uint8Array(json.length + 8).fill(34);
      padded.set(json, offset);
      const tape = new ResponseTape();
      const top = tape.add(padded.subarray(offset, offset + json.length));
      expect(tape.read(top)).toEqual({ s: strings });
    }
  });

  it('reads and merges the same bytes added again, on this tape or another', () => {
    const bytes = encoder.encode(
      JSON.stringify({ a: { b: 1 }, l: [{ c: 2 }] }),
    );
    const first = new ResponseTape();
    const second = new ResponseTape();
    second.add(encoder.encode('{"x":0}'));
    const one = first.add(bytes, true);
    const two = second.add(bytes, true);
    const again = second.add(bytes, true);
    expect(second.read(two)).toEqual(first.read(one));
    expect(second.read(again)).toEqual(first.read(one));
    // merging into one copy leaves the others as they were
    second.link(two, add(second, { a: { z: 3 } }));
    expect(second.read(two)).toEqual({ a: { b: 1, z: 3 }, l: [{ c: 2 }] });
    expect(second.read(again)).toEqual({ a: { b: 1 }, l: [{ c: 2 }] });
    expect(first.read(one)).toEqual({ a: { b: 1 }, l: [{ c: 2 }] });
  });

  it('takes the first of duplicate keys, which a GraphQL response never has', () => {
    // JSON.parse takes the last one, looking up a key stops at the first match instead
    const tape = new ResponseTape();
    const top = tape.add(encoder.encode('{"a":1,"a":2}'));
    expect(tape.read(tape.member(top, quotedKey('a')))).toBe(1);
  });

  it('finds type names by their bytes, also when they are written with escapes', () => {
    const tape = new ResponseTape();
    const top = tape.add(
      encoder.encode('["User","User","\\u0055ser","Us\\"er","Üser"]'),
    );
    const names: (string | undefined)[] = [];
    tape.forEachItem(top, (item) => names.push(tape.typename(item)));
    expect(names).toEqual(['User', 'User', 'User', 'Us"er', 'Üser']);
    // again, now from what it decoded before
    const again: (string | undefined)[] = [];
    tape.forEachItem(top, (item) => again.push(tape.typename(item)));
    expect(again).toEqual(names);
  });

  it('tells when a body is not JSON it can read', () => {
    const tape = new ResponseTape();
    expect(tape.add(encoder.encode('{"a":1'))).toBe(-1);
    expect(tape.add(encoder.encode('{"a":"open}'))).toBe(-1);
    expect(tape.add(encoder.encode('}'))).toBe(-1);
  });

  it('merges by linking like deepMerge, on random JSON', () => {
    // a small seeded random so a failure is reproducible
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const keys = ['a', 'b', 'c'];
    const value = (depth: number): unknown => {
      const r = random();
      if (depth > 2 || r < 0.3) {
        return [null, 1, 'x', true, 2.5][Math.floor(random() * 5)];
      }
      if (r < 0.5) {
        return Array.from({ length: Math.floor(random() * 3) }, () =>
          value(depth + 1),
        );
      }
      const object: Record<string, unknown> = {};
      for (const key of keys) {
        if (random() < 0.6) {
          object[key] = value(depth + 1);
        }
      }
      return object;
    };
    for (let run = 0; run < 2000; run++) {
      const parts = Array.from({ length: 1 + Math.floor(random() * 3) }, () =>
        value(0),
      );
      const tape = new ResponseTape();
      const nodes = parts.map((part) => add(tape, part));
      // merged at the top like a root fetch's data
      const expected = parts.reduce(
        (target: unknown, source) => deepMerge(target, structuredClone(source)),
        structuredClone(parts[0]),
      );
      const first = nodes[0]!;
      const kind = tape.kind(first);
      if (kind !== K_OBJ && kind !== K_ARR) {
        continue;
      }
      if (
        parts.some(
          (part, i) =>
            i &&
            part !== null &&
            (typeof part !== 'object' ||
              Array.isArray(part) !== (kind === K_ARR)),
        )
      ) {
        // a value of another kind replaces it, at the top the executor only links its own kind,
        // below it the tape folds them like deepMerge, which this checks
        continue;
      }
      for (const node of nodes.slice(1)) {
        if (!tape.isNull(node) && tape.kind(node) === kind) {
          tape.link(first, node);
        }
      }
      expect(tape.read(first), JSON.stringify(parts)).toEqual(expected);
    }
  });
});

describe('ResponseWriter', () => {
  it('writes bytes, copies and strings', () => {
    const writer = new ResponseWriter();
    const body = encoder.encode('"0123456789012345678901234567890123456789"');
    writer.byte(123);
    writer.string('k"é');
    writer.byte(58);
    writer.copy(body, 0, body.length);
    writer.byte(44);
    writer.string('n');
    writer.byte(58);
    writer.null();
    writer.byte(125);
    expect(JSON.parse(decoder.decode(writer.take()))).toEqual({
      'k"é': '0123456789012345678901234567890123456789',
      n: null,
    });
  });
});
