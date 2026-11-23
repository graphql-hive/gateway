import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { compileRawForwardPlan } from '../../src/rawForward/plan';
import { verifyRawForwardBody } from '../../src/rawForward/verifier';
import { buildExampleSchema } from './schema';

const plan = compileRawForwardPlan(
  { schema: buildExampleSchema() },
  parse(
    `{ product { __typename id name price stock inStock currency currencies tags
        attributes related { id title: name } matrix } }`,
  ),
)!;

const verify = (body: string | Uint8Array) =>
  verifyRawForwardBody(
    plan.root,
    typeof body === 'string' ? Buffer.from(body) : body,
  );

const good = {
  __typename: 'Product',
  id: 'p1',
  name: 'Lamp',
  price: 12.5,
  stock: 3,
  inStock: true,
  currency: 'USD',
  currencies: ['USD', 'EUR'],
  tags: ['a', 'b'],
  attributes: { colors: ['red', { shade: null }], label: 'q"\\' },
  related: { id: 'p2', title: null },
  matrix: [['a', 'b'], null, []],
};
const wrap = (product: unknown) =>
  `{"data":{"product":${typeof product === 'string' ? product : JSON.stringify(product)}}}`;
const { __typename: _t, id: _i, ...rest } = good;
const canonical = wrap(good);
const bytes = Buffer.from(canonical);

// The canonical body with one field's JSON replaced by the raw text.
function field(key: string, raw: string): string {
  const json = JSON.stringify({ ...good, [key]: '@@' });
  return wrap(json.replace('"@@"', () => raw));
}
// The canonical body with a piece of its text replaced.
const edit = (from: string, to: string) => {
  expect(canonical).toContain(from);
  return canonical.replace(from, () => to);
};
// A body whose `name` holds the given raw bytes.
function withBytes(raw: number[]): Buffer {
  const text = Buffer.from(field('name', '"@@"'));
  const at = text.indexOf('@@');
  return Buffer.concat([
    text.subarray(0, at),
    Buffer.from(raw),
    text.subarray(at + 2),
  ]);
}
const nested = (open: string, close: string, n: number) =>
  open.repeat(n) + close.repeat(n);

describe('verifyRawForwardBody', () => {
  it.each<[string, string | Uint8Array]>([
    ['the canonical body', canonical],
    ['null root field', '{"data":{"product":null}}'],
    [
      'nullable values set to null',
      wrap({
        ...good,
        name: null,
        price: null,
        stock: null,
        inStock: null,
        currency: null,
        currencies: null,
        attributes: null,
        related: null,
        matrix: null,
      }),
    ],
    [
      'empty lists and nulls in a nullable list',
      wrap({ ...good, currencies: [], matrix: [null, [null, 'a']] }),
    ],
    [
      'whitespace around every token',
      ` \n${canonical.replace(/([{}[\],:])/g, ' \r\n\t$1 \r\n')}\t`,
    ],
    [
      'string escapes and non-ASCII text',
      field(
        'name',
        '"a\\"b\\\\c\\/d\\b\\f\\n\\r\\t\\u00e9\\ud83d\\ude00 é 😀"',
      ),
    ],
    ['a lone surrogate escape', field('name', '"\\ud800"')],
    ['an ID that looks numeric', field('id', '"5"')],
    ['Int 2147483647', field('stock', '2147483647')],
    ['Int -2147483648', field('stock', '-2147483648')],
    ['Int -0', field('stock', '-0')],
    ['Float with exponent', field('price', '-1.25e-7')],
    ['Float written as an integer', field('price', '5')],
    ['Float with 15 digits', field('price', '123456789012.345')],
    ['Float with a 2 digit exponent and capital E', field('price', '1E+99')],
    ['Boolean false', field('inStock', 'false')],
    ['enum members', field('currencies', '["GBP","USD","GBP"]')],
    [
      'custom scalar: any JSON, whitespace, duplicate keys, escapes',
      field(
        'attributes',
        '[1,"a",true,false,null,{ "a" : {"b":[]},"a":2},-0.5e3,{"k\\n":"v\\u0041"}]',
      ),
    ],
    [
      'custom scalar numbers at the limits',
      field('attributes', '[123456789012345,1e-99]'),
    ],
    [
      'custom scalar nested 256 deep',
      field('attributes', nested('[', ']', 256)),
    ],
    [
      '2 and 4 byte UTF-8 characters',
      withBytes([0xc3, 0xa9, 0xf0, 0x9f, 0x98, 0x80]),
    ],
  ])('accepts %s', (_name, body) => {
    expect(verify(body)).toBe(true);
  });

  it.each<[string, string | Uint8Array]>([
    // top level
    [
      'errors next to data',
      canonical.replace(/}$/, ',"errors":[{"message":"x"}]}'),
    ],
    ['extensions next to data', canonical.replace(/}$/, ',"extensions":{}}')],
    ['errors before data', `{"errors":[],${canonical.slice(1)}`],
    ['data null', '{"data":null}'],
    ['data not an object', '{"data":[]}'],
    ['data duplicated', canonical.replace(/}$/, ',"data":{}}')],
    ['an empty body', ''],
    ['an empty object', '{}'],
    ['not JSON', 'not json'],
    ['a misspelled data key', canonical.replace('"data"', '"dat"')],
    ['an escaped data key', canonical.replace('"data"', '"d\\u0061ta"')],
    ['a BOM', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])],
    ['trailing garbage', canonical + 'x'],
    ['a trailing second value', canonical + canonical],
    ['a trailing NUL byte', Buffer.concat([bytes, Buffer.from([0])])],
    // keys
    ['a missing first key', wrap({ ...good, __typename: undefined })],
    ['a missing last key', wrap({ ...good, matrix: undefined })],
    ['an extra key at the end', wrap({ ...good, extra: 1 })],
    ['an extra key at the start', wrap({ extra: 1, ...good })],
    [
      'an extra nested key',
      wrap({ ...good, related: { id: 'p2', title: null, z: 1 } }),
    ],
    [
      'reordered keys',
      wrap({ id: good.id, __typename: good.__typename, ...rest }),
    ],
    [
      'the field name where the alias is expected',
      wrap({ ...good, related: { id: 'p2', name: null } }),
    ],
    ['a duplicated key', edit('"id":"p1"', '"id":"p1","id":"p1"')],
    ['an escaped spelling of a key', edit('"name"', '"na\\u006de"')],
    [
      'a key that is a prefix of the expected key',
      edit('"inStock"', '"inSto"'),
    ],
    ['a key that extends the expected key', edit('"inStock"', '"inStocks"')],
    ['a missing colon', edit('"name":', '"name"')],
    ['a missing comma', edit('"id":"p1",', '"id":"p1"')],
    [
      'a trailing comma in an object',
      edit(',"matrix":[["a","b"],null,[]]}', ',"matrix":[["a","b"],null,[]],}'),
    ],
    // nullability and __typename
    ['null for a non-null ID', field('id', 'null')],
    ['null for a non-null list', field('tags', 'null')],
    ['null inside a list of non-null values', field('tags', '["a",null]')],
    ['null for __typename', field('__typename', 'null')],
    ['another __typename', field('__typename', '"Review"')],
    ['a __typename with an escape', field('__typename', '"Produc\\u0074"')],
    ['a __typename that is a prefix', field('__typename', '"Produc"')],
    // leaves
    ['a number for an ID', field('id', '5')],
    ['an object for a String', field('name', '{}')],
    ['Int 2147483648', field('stock', '2147483648')],
    ['Int -2147483649', field('stock', '-2147483649')],
    ['Int with 11 digits', field('stock', '10000000000')],
    ['Int 1.0', field('stock', '1.0')],
    ['Int with a leading zero', field('stock', '01')],
    ['Int as a string', field('stock', '"5"')],
    ['Int with a plus sign', field('stock', '+1')],
    ['Float with 16 significant digits', field('price', '0.1234567890123456')],
    ['Float with a 3 digit exponent', field('price', '1e-100')],
    ['Float with a padded exponent', field('price', '1e001')],
    ['Float with a trailing dot', field('price', '1.')],
    ['Float with a leading dot', field('price', '.5')],
    ['Float with an empty exponent', field('price', '1e+')],
    ['Boolean as a string', field('inStock', '"true"')],
    ['Boolean misspelled', field('inStock', 'tru')],
    ['an unknown enum value', field('currency', '"CHF"')],
    ['an enum value in lower case', field('currency', '"usd"')],
    ['an enum value as a number', field('currency', '1')],
    ['an enum value with an escape', field('currency', '"US\\u0044"')],
    ['an unterminated enum value', field('currency', '"USD')],
    // structure
    ['an object where a list is expected', field('tags', '{}')],
    ['a list where an object is expected', field('related', '[]')],
    ['a scalar where a list is expected', field('tags', '"a"')],
    ['a flat list where nested lists are expected', field('matrix', '["a"]')],
    ['an unterminated list', field('tags', '["a"')],
    ['a list with a trailing comma', field('tags', '["a",]')],
    // custom scalar
    [
      'a custom scalar number with 16 digits',
      field('attributes', '1234567890123456'),
    ],
    [
      'a custom scalar number with a 3 digit exponent',
      field('attributes', '1e100'),
    ],
    [
      'a custom scalar with an invalid literal',
      field('attributes', '{"n":nul}'),
    ],
    ['a custom scalar with a trailing comma', field('attributes', '[1,]')],
    ['a custom scalar with an unquoted key', field('attributes', '{a:1}')],
    [
      'a custom scalar with an unterminated object',
      field('attributes', '{"a":1'),
    ],
    ['a custom scalar with a bad escape', field('attributes', '"\\x"')],
    [
      'a custom scalar with a raw control character',
      field('attributes', '"a\u0000b"'),
    ],
    [
      'a custom scalar nested 257 deep',
      field('attributes', nested('[', ']', 257)),
    ],
    [
      'a custom scalar nested 10000 deep in objects',
      field('attributes', nested('{"a":', '}', 10000)),
    ],
    // strings
    ['an invalid escape', field('name', '"\\x"')],
    ['an invalid unicode escape', field('name', '"\\u12G4"')],
    ['a dangling backslash', field('name', '"abc\\"')],
    ['a raw control character', field('name', '"a\u0001b"')],
    ['an unterminated string', field('name', '"abc')],
    // UTF-8
    ['an invalid UTF-8 sequence', withBytes([0xc3, 0x28])],
    ['an overlong encoding', withBytes([0xc0, 0xaf])],
    ['a UTF-8 encoded surrogate', withBytes([0xed, 0xa0, 0x80])],
    ['a truncated multi-byte sequence', withBytes([0xe2, 0x82])],
    ['a code point above U+10FFFF', withBytes([0xf4, 0x90, 0x80, 0x80])],
  ])('rejects %s', (_name, body) => {
    expect(verify(body)).toBe(false);
  });

  it('rejects every proper prefix of the canonical body', () => {
    for (let cut = 0; cut < bytes.length; cut++) {
      if (verify(bytes.subarray(0, cut))) {
        throw new Error(`accepted a prefix cut at ${cut}`);
      }
    }
    expect(verify(bytes)).toBe(true);
  });

  it('can be called again after a rejection', () => {
    expect(verify(field('attributes', '['.repeat(300)))).toBe(false);
    expect(verify('{"data":')).toBe(false);
    expect(verify(canonical)).toBe(true);
  });

  it('reads a view at its offset and length', () => {
    const padded = Buffer.concat([Buffer.from('xx'), bytes, Buffer.from('yy')]);
    expect(verify(padded.subarray(2, 2 + bytes.length))).toBe(true);
    expect(verify(padded)).toBe(false);
  });
});
