import { isUtf8 } from 'node:buffer';
import { executeSync, parse, type DocumentNode } from 'graphql';
import { describe, expect, it } from 'vitest';
import { compileRawForwardPlan } from '../../src/rawForward/plan';
import {
  ANY,
  BOOLEAN,
  CONSTANT,
  ENUM,
  FLOAT,
  INT,
  LIST,
  OBJECT,
  STRING,
  verifyRawForwardBody,
  type PlanNode,
} from '../../src/rawForward/verifier';
import { buildExampleSchema } from './schema';

// Soundness of the verifier against graphql-js: whenever the verifier accepts
// the bytes of a (mutated) subgraph response, executing the client operation
// over that response as the root value must produce no errors and the same
// JSON value, in the same key order. That is what the regular path returns.

const schema = buildExampleSchema();

const queries = [
  `{ product { __typename id name price stock inStock currency currencies tags
      attributes related { id title: name } matrix } }`,
  'query Catalog { catalog { __typename products { id name price tags } featured { id currency } } }',
  '{ products { id stock attributes matrix } }',
  `query Aliased($id: ID) {
    top: product(id: $id) { ...Details related { ... on Product { id } } }
  }
  fragment Details on Product { key: id name currencies reviews { id rating body } }`,
].map((text) => {
  const document = parse(text);
  const plan = compileRawForwardPlan({ schema }, document);
  if (!plan) {
    throw new Error('the fuzzed query must be eligible: ' + text);
  }
  return { document, plan };
});

// xorshift32, so that every run sees the same mutants
function createRandom(seed: number) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)]!,
  };
}
type Random = ReturnType<typeof createRandom>;

// prettier-ignore
const strings = ['', 'a', 'café 😀', 'q"\\', 'line\nbreak', '}{][,:', 'null', ' ', '\u0000'];
// prettier-ignore
const anyValues: unknown[] = [
  null, 1, -2.5, 'x', true, [], {}, { a: [1, { b: 'c' }], d: null }, [[1, 2], ['}', '"']],
  1e21, 123456789012345, { 1: 'integer-like key', b: 2 },
];

// A random valid value for a plan node: the shape a subgraph would return.
function generate(random: Random, node: PlanNode): unknown {
  if (!node.nonNull && random.next() < 0.1) {
    return null;
  }
  switch (node.kind) {
    case OBJECT:
      return Object.fromEntries(
        node.responseKeys.map((key, i) => [
          key,
          generate(random, node.children[i]!),
        ]),
      );
    case LIST:
      return Array.from({ length: random.int(4) }, () =>
        generate(random, node.ofNode),
      );
    case STRING:
      return random.pick(strings);
    case INT:
      return random.pick([0, -1, 42, 2147483647, -2147483648]);
    case FLOAT:
      return random.pick([0, 1.5, -0.001, 1e-7, 123456.789, 5]);
    case BOOLEAN:
      return random.pick([true, false]);
    case ENUM:
      return random.pick([...node.values]);
    case CONSTANT:
      return JSON.parse(Buffer.from(node.token).toString());
    case ANY:
      return random.pick(anyValues);
  }
}

// Replacement texts for a value: other JSON types, edge spellings, broken syntax.
// prettier-ignore
const snippets = [
  'null', '"GAMMA"', '"USD"', '"Product"', '1.5', '"5"', '5', '{}', '[]', 'true', 'false',
  '0', '-0', '1.0', '1e0', '1E+0', '01', '2147483648', '-2147483649', '0.1234567890123456',
  '1e100', '12345678901234567890', '"\\u0041"', '"\\ud800"', '"\\x"', '"', '\\', ',', ':',
  '}', ']', '{', '[', ' ', '\n', '\t', '\f', '"x":1,',
];
// prettier-ignore
const rawBytes = [[0xc3], [0xc3, 0xa9], [0xff], [0xe2, 0x82], [0x80], [0xf0, 0x9f, 0x98, 0x80]];
type Respell = (m: string) => string;
// prettier-ignore
const intRespell: Respell[] = [(m) => m + '.0', (m) => m + 'e0', (m) => '0' + m, (m) => (m.startsWith('-') ? m.slice(1) : '-' + m), (m) => m + '0'.repeat(10)];
// prettier-ignore
const numberRespell: Respell[] = [(m) => m + 'E+2', (m) => m + 'e-100', (m) => m + '1234567890123456', (m) => '+' + m, (m) => m + '.'];

const jsonLeaf =
  '"(?:[^"\\\\]|\\\\.)*"|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?|true|false|null';
const valueRegex = new RegExp(`:(${jsonLeaf})`, 'g');
const keyValueRegex = new RegExp(`("\\w+":)(${jsonLeaf})`, 'g');
const punctuationRegex = /[,:{}[\]]/g;

function mutate(random: Random, input: Buffer): Buffer {
  const at = random.int(input.length);
  const s = input.toString('utf8');
  const splice = (from: number, to: number, text: string) =>
    Buffer.from(s.slice(0, from) + text + s.slice(to));
  switch (random.int(11)) {
    case 0: {
      const out = Buffer.from(input);
      out[at] = random.int(256);
      return out;
    }
    case 1:
      return Buffer.concat([
        input.subarray(0, at),
        input.subarray(at + 1 + random.int(6)),
      ]);
    case 2:
      return Buffer.concat([
        input.subarray(0, at),
        Buffer.from(random.pick(snippets)),
        input.subarray(at),
      ]);
    case 3:
      return Buffer.concat([
        input.subarray(0, at),
        Buffer.from(random.pick(rawBytes)),
        input.subarray(at),
      ]);
    case 4: {
      // swap two keys
      const keys = [...s.matchAll(/"\w+":/g)];
      if (keys.length < 2) return input;
      const [a, b] = [random.pick(keys), random.pick(keys)];
      return Buffer.from(
        s.replace(a[0], '\u0000').replace(b[0], a[0]).replace('\u0000', b[0]),
      );
    }
    case 5: {
      // replace a value by one of another JSON type
      const values = [...s.matchAll(valueRegex)];
      if (!values.length) return input;
      const v = random.pick(values);
      return splice(v.index + 1, v.index + v[0].length, random.pick(snippets));
    }
    case 6: {
      // respell a number
      const numbers = [...s.matchAll(/:(-?\d+(?:\.\d+)?)/g)];
      if (!numbers.length) return input;
      const n = random.pick(numbers);
      const respells = /^-?\d+$/.test(n[1]!)
        ? [...intRespell, ...numberRespell]
        : numberRespell;
      return splice(
        n.index + 1,
        n.index + 1 + n[1]!.length,
        random.pick(respells)(n[1]!),
      );
    }
    case 7: {
      // whitespace after a structural character
      const m = random.pick([...s.matchAll(punctuationRegex)]);
      return splice(
        m.index + 1,
        m.index + 1,
        random.pick([' ', '\n', '\r\n\t ', '\f']),
      );
    }
    case 8:
    case 9: {
      // drop, or duplicate, a key and its value
      const k = random.pick([...s.matchAll(keyValueRegex)]);
      if (!k) return input;
      const end = k.index + k[0].length;
      return random.next() < 0.5
        ? Buffer.from(s.slice(0, k.index) + s.slice(end).replace(/^,/, ''))
        : splice(k.index, k.index, k[0] + ',');
    }
    default:
      return Buffer.from(
        JSON.stringify(JSON.parse(s), null, random.pick([1, 2, '\t'])),
      );
  }
}

// The value the regular path returns for the same subgraph data: the stitching
// default resolver reads a field under its response key.
function regularPath(document: DocumentNode, data: unknown) {
  return executeSync({
    schema,
    document,
    rootValue: data,
    fieldResolver: (source, _args, _context, info) => source?.[info.path.key],
  });
}

// Throws with the offending body: `expect(value, message)` is vitest-only.
function unsound(reason: string, body: Buffer): never {
  throw new Error(`${reason}: ${body.toString('utf8')}`);
}

function assertSound(document: DocumentNode, body: Buffer) {
  if (!isUtf8(body)) unsound('accepted invalid UTF-8', body);
  const parsed = JSON.parse(body.toString('utf8'));
  if (Object.keys(parsed).join() !== 'data') {
    unsound('accepted extra top level keys', body);
  }
  const result = regularPath(document, parsed.data);
  if (result.errors) unsound('regular path reports errors', body);
  if (JSON.stringify(result.data) !== JSON.stringify(parsed.data)) {
    unsound('value differs', body);
  }
}

describe('verifyRawForwardBody against graphql-js', () => {
  it('accepts every generated valid body, and the regular path agrees', () => {
    const random = createRandom(0x2f6e2b1);
    for (const { document, plan } of queries) {
      for (let i = 0; i < 1000; i++) {
        const body = Buffer.from(
          JSON.stringify({ data: generate(random, plan.root) }),
        );
        if (!verifyRawForwardBody(plan.root, body))
          unsound('rejected a valid body', body);
        assertSound(document, body);
      }
    }
  });

  it('only accepts mutated bodies that the regular path returns unchanged', () => {
    const random = createRandom(0x9e3779b9);
    let mutants = 0;
    let accepted = 0;
    let acceptedChanged = 0;
    for (const { document, plan } of queries) {
      for (let i = 0; i < 2500; i++) {
        const canonical = Buffer.from(
          JSON.stringify({ data: generate(random, plan.root) }),
        );
        for (let m = 0; m < 8; m++) {
          let body: Buffer = canonical;
          try {
            for (let r = 1 + random.int(3); r > 0; r--)
              body = mutate(random, body);
          } catch {
            // a mutation that cannot be applied to this body
            continue;
          }
          mutants++;
          if (!verifyRawForwardBody(plan.root, body)) continue;
          accepted++;
          if (!body.equals(canonical)) acceptedChanged++;
          assertSound(document, body);
        }
      }
    }
    // not vacuous: both outcomes occur, including accepted mutants that differ
    // from the canonical body (whitespace, spellings, swaps)
    expect(mutants).toBeGreaterThan(70000);
    expect(accepted).toBeGreaterThan(10000);
    expect(acceptedChanged).toBeGreaterThan(7000);
    expect(mutants - accepted).toBeGreaterThan(50000);
  });

  it('uses an oracle that does notice invalid responses', () => {
    const { document, plan } = queries[0]!;
    const valid = generate(createRandom(1), plan.root) as any;
    expect(regularPath(document, valid).errors).toBeUndefined();
    const broken = (change: (product: any) => void) => {
      const data = structuredClone(valid);
      data.product ??= {};
      change(data.product);
      return regularPath(document, data).errors;
    };
    expect(broken((p) => (p.currency = 'GAMMA'))).toBeDefined();
    expect(broken((p) => (p.stock = 2147483648))).toBeDefined();
    expect(broken((p) => (p.tags = null))).toBeDefined();
    expect(broken((p) => (p.inStock = 'yes'))).toBeDefined();
  });
});
