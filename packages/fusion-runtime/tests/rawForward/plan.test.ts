import {
  buildSchema,
  GraphQLEnumType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  parse,
} from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  compileRawForwardPlan,
  subgraphDocumentMatchesPlan,
} from '../../src/rawForward/plan';
import { buildExampleSchema } from './schema';

const schema = buildExampleSchema();
const plan = (query: string, operationName?: string, s = schema) =>
  compileRawForwardPlan({ schema: s }, parse(query), operationName);

// Rows without an operation name get an explicit `undefined`: jest and bun
// read a callback that declares more parameters than the row has as `done`.
const optionalName = (rows: [string, string, string?][]) =>
  rows.map(
    ([name, query, operationName]): [string, string, string | undefined] => [
      name,
      query,
      operationName,
    ],
  );

describe('compileRawForwardPlan', () => {
  it.each<[string, string, string | undefined]>(
    optionalName([
      [
        'every leaf kind, aliases, nested lists and __typename',
        `{ product { __typename id name price inStock currency currencies tags
          attributes matrix key: id related { id title: name } reviews { id rating } } }`,
      ],
      [
        'variables and a root alias',
        'query Q($id: ID) { a: product(id: $id) { id } }',
      ],
      ['non-null root and list of objects', '{ catalog { products { id } } }'],
      [
        'fragment spread and inline fragments (same type, interface, union, none)',
        `{ product { ...F ... on Product { id } ... on Node { id } ... { name }
          ... on SearchResult { __typename } } }
       fragment F on Product { id name }`,
      ],
      [
        'fragments on unrelated types are dropped',
        'query { product { id ... on Review { body } ...R } } fragment R on Review { body }',
      ],
      [
        'operation selected by name, unused fragment',
        'query A { product { id } } query B { products { id } product { id } } fragment U on Product { id }',
        'A',
      ],
      [
        'a fragment cycle terminates',
        'query { product { ...A } } fragment A on Product { id ...B } fragment B on Product { name ...A }',
      ],
    ]),
  )('eligible: %s', (_name, query, operationName) => {
    expect(plan(query, operationName)).not.toBeNull();
  });

  it('records the root key', () => {
    const result = plan('{ first: product { id } }');
    expect(result?.rootKey).toBe('first');
    expect(result?.root.responseKeys).toEqual(['first']);
    expect(result?.operation.operation).toBe('query');
  });

  const v = 'query($v: Boolean!)';
  it.each<[string, string, string | undefined]>(
    optionalName([
      ['mutation', 'mutation { touch { id } }'],
      ['subscription', 'subscription { changed { id } }'],
      ['two root fields', '{ product { id } catalog { featured { id } } }'],
      [
        'two root fields in the selected operation',
        'query A { product { id } } query B { product { id } products { id } }',
        'B',
      ],
      ['root __typename', '{ __typename product { id } }'],
      ['__schema', '{ __schema { queryType { name } } }'],
      ['unknown nested field', '{ product { nope } }'],
      ['object field without a selection', '{ product }'],
      ['@include on a field', `${v} { product { id name @include(if: $v) } }`],
      [
        '@skip on an inline fragment',
        `${v} { product { id ... on Product @skip(if: $v) { name } } }`,
      ],
      [
        '@skip on a fragment spread',
        `${v} { product { id ...F @skip(if: $v) } } fragment F on Product { name }`,
      ],
      [
        'directive on a fragment definition',
        'query { product { id ...F } } fragment F on Product @unknown { name }',
      ],
      [
        'directive on the root field',
        `${v} { product @include(if: $v) { id } }`,
      ],
      ['directive on the operation', 'query @live { product { id } }'],
      ['interface field', '{ node { id } }'],
      ['union field', '{ search { ... on Product { id } } }'],
      ['interface field nested', '{ product { related { id } } node { id } }'],
      [
        'several operations without a name',
        'query A { product { id } } query B { product { id } }',
      ],
      ['operation name that does not exist', 'query A { product { id } }', 'X'],
      ['missing fragment', '{ product { ...Missing } }'],
      [
        'only an unrelated fragment applies',
        '{ product { ... on Review { id } } }',
      ],
      ['no operation', 'fragment F on Product { id }'],
      ['type system definition', '{ product { id } } scalar Extra'],
    ]),
  )('ineligible: %s', (_name, query, operationName) => {
    expect(plan(query, operationName)).toBeNull();
  });

  it('is not eligible when the schema has no query type', () => {
    expect(
      plan('{ product { id } }', undefined, new GraphQLSchema({})),
    ).toBeNull();
  });

  describe('schema-dependent rules', () => {
    it('rejects an enum whose internal value differs from its name', () => {
      const mode = (values: any) =>
        new GraphQLEnumType({ name: 'Mode', values });
      const custom = (type: GraphQLEnumType) =>
        new GraphQLSchema({
          query: new GraphQLObjectType({
            name: 'Query',
            fields: {
              thing: {
                type: new GraphQLObjectType({
                  name: 'Thing',
                  fields: { mode: { type }, name: { type: GraphQLString } },
                }),
              },
            },
          }),
        });
      const q = '{ thing { mode name } }';
      expect(plan(q, undefined, custom(mode({ A: {}, B: {} })))).not.toBeNull();
      expect(
        plan(q, undefined, custom(mode({ A: { value: 'a' }, B: {} }))),
      ).toBeNull();
    });

    it.each(['serialize', 'parseValue'])(
      'rejects a custom scalar with its own %s',
      (member) => {
        const local = buildExampleSchema();
        const q = '{ product { attributes } }';
        expect(plan(q, undefined, local)).not.toBeNull();
        (local.getType('JSON') as any)[member] = (value: unknown) => value;
        expect(plan(q, undefined, local)).toBeNull();
      },
    );

    it('rejects a nested resolver unless it is the default field resolver', () => {
      const local = buildExampleSchema();
      const q = parse('{ product { id name } }');
      const fields = (
        local.getType('Product') as GraphQLObjectType
      ).getFields();
      const resolver = (source: any, _a: any, _c: any, info: any) =>
        source[info.path.key];
      fields['name']!.resolve = resolver;
      expect(compileRawForwardPlan({ schema: local }, q)).toBeNull();
      expect(
        compileRawForwardPlan(
          { schema: local, defaultFieldResolver: resolver },
          q,
        ),
      ).not.toBeNull();
      // other fields are not affected
      expect(
        compileRawForwardPlan({ schema: local }, parse('{ product { id } }')),
      ).not.toBeNull();
    });

    it('ignores the resolver of the root field', () => {
      const local = buildExampleSchema();
      (local.getType('Query') as GraphQLObjectType).getFields()[
        'product'
      ]!.resolve = () => ({});
      expect(plan('{ product { id } }', undefined, local)).not.toBeNull();
    });

    it('rejects a plan that would be unreasonably large', () => {
      const local = buildSchema(
        'type Query { a: T } type T { x: T, y: T, z: T }',
      );
      // each fragment selects the next one three times, 3^12 objects
      let document = '{ a { ...F0 } }';
      for (let i = 0; i < 12; i++) {
        const next = `...F${i + 1}`;
        document += ` fragment F${i} on T { x { ${next} } y { ${next} } z { ${next} } }`;
      }
      document += ' fragment F12 on T { __typename }';
      expect(plan(document, undefined, local)).toBeNull();
    });
  });
});

describe('subgraphDocumentMatchesPlan', () => {
  const clientPlan = plan(
    '{ product { id label: name related { id } reviews { rating } } }',
  )!;
  const body = 'id label: name related { id } reviews { rating }';

  it.each<[string, string, boolean]>([
    [
      'same selection, other name and variables',
      `query X($a: ID) { product(id: $a) { ${body} } }`,
      true,
    ],
    [
      'fragments and inline fragments flatten to the same keys',
      `{ product { ...P related { ... on Product { id } } ... { reviews { ...R } } } }
       fragment P on Product { id label: name } fragment R on Review { rating }`,
      true,
    ],
    [
      'key field added nested',
      `{ product { id label: name related { id } reviews { rating id } } }`,
      false,
    ],
    [
      'field added at the end of the root object',
      `{ product { ${body} price } }`,
      false,
    ],
    ['__typename added', `{ product { __typename ${body} } }`, false],
    [
      'different order',
      '{ product { label: name id related { id } reviews { rating } } }',
      false,
    ],
    [
      'alias dropped',
      '{ product { id name related { id } reviews { rating } } }',
      false,
    ],
    [
      'same key for a different field',
      '{ product { id label: price related { id } reviews { rating } } }',
      false,
    ],
    [
      'missing field',
      '{ product { id related { id } reviews { rating } } }',
      false,
    ],
    ['root key renamed', `{ _0_product: product { ${body} } }`, false],
    ['different operation type', `mutation { product { ${body} } }`, false],
    [
      'directive on a field',
      `{ product { id label: name @include(if: true) related { id } reviews { rating } } }`,
      false,
    ],
    [
      'directive on the operation',
      `query @live { product { ${body} } }`,
      false,
    ],
    [
      'selection on a leaf',
      '{ product { id label: name { x } related { id } reviews { rating } } }',
      false,
    ],
    [
      'two operations',
      `{ product { ${body} } } query B { product { id } }`,
      false,
    ],
    ['type system definition', `{ product { ${body} } } scalar Extra`, false],
  ])('%s', (_name, document, expected) => {
    expect(
      subgraphDocumentMatchesPlan(schema, clientPlan, parse(document)),
    ).toBe(expected);
  });
});
