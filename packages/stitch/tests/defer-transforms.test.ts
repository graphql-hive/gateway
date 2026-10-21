import { setTimeout } from 'timers/promises';
import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import { executorFromSchema, normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  asArray,
  ExecutionResult,
  isAsyncIterable,
  mergeDeep,
} from '@graphql-tools/utils';
import {
  HoistField,
  MapLeafValues,
  PruneSchema,
  RenameObjectFields,
  RenameRootFields,
  RenameRootTypes,
  RenameTypes,
  TransformCompositeFields,
  TransformQuery,
  WrapFields,
} from '@graphql-tools/wrap';
import {
  GraphQLList,
  GraphQLObjectType,
  Kind,
  OperationTypeNode,
  parse,
} from 'graphql';
import _ from 'lodash';
import { describe, expect, it } from 'vitest';
import { stitchSchemas } from '../src/index.js';

function mergeIncrementalResults(values: ExecutionResult[]) {
  const result: ExecutionResult = {};
  for (const value of values) {
    if (value.data) {
      result.data = result.data
        ? mergeDeep([result.data, value.data])
        : value.data;
    }
    if (value.errors) {
      result.errors = [...(result.errors ?? []), ...value.errors];
    }
    if (value.incremental) {
      for (const incremental of value.incremental) {
        if (incremental.path) {
          result.data = result.data || {};
          const incrementalItems = incremental.items
            ? asArray(incremental.items).filter((item) => item != null)
            : [];
          if (incremental.data != null) {
            incrementalItems.unshift(incremental.data);
          }
          for (const incrementalItem of incrementalItems) {
            if (!incremental.path.length) {
              result.data = mergeDeep([result.data, incrementalItem]);
            } else {
              const existingData = _.get(result.data, incremental.path);
              if (!existingData) {
                _.set(result.data, incremental.path, incrementalItem);
              } else {
                _.set(
                  result.data,
                  incremental.path,
                  mergeDeep([existingData, incrementalItem]),
                );
              }
            }
          }
        }
        if (incremental.errors) {
          result.errors = [...(result.errors ?? []), ...incremental.errors];
        }
      }
    }
  }
  return result;
}

async function collectAll(
  result: unknown,
): Promise<{ values: ExecutionResult[]; timings: number[] }> {
  const t0 = Date.now();
  const values: ExecutionResult[] = [];
  const timings: number[] = [];
  if (!isAsyncIterable(result)) {
    return {
      values: [result as ExecutionResult],
      timings: [Date.now() - t0],
    };
  }
  for await (const value of result) {
    values.push(value as ExecutionResult);
    timings.push(Date.now() - t0);
  }
  return { values, timings };
}

function baseSomethingSchema(options?: {
  slowMs?: number;
  boom?: boolean;
  mapValue?: (v: string) => string;
}) {
  const slowMs = options?.slowMs ?? 80;
  return makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Something {
        fastField: String!
        slowField: String
        nested: Nested
      }
      type Nested {
        name: String
        slowName: String
      }
      type Query {
        something: Something
      }
    `,
    resolvers: {
      Query: { something: () => ({}) },
      Something: {
        fastField: () => 'fast',
        slowField: async () => {
          await setTimeout(slowMs);
          if (options?.boom) {
            throw new Error('deferred boom');
          }
          const value = 'slow';
          return options?.mapValue ? options.mapValue(value) : value;
        },
        nested: () => ({ name: 'nested-fast' }),
      },
      Nested: {
        slowName: async () => {
          await setTimeout(slowMs);
          return 'nested-slow';
        },
      },
    },
  });
}

describe('transforms with @defer (gateway-owned)', () => {
  it('RenameTypes on deferred nested fields', async () => {
    const schema = baseSomethingSchema();
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          transforms: [
            new RenameTypes((name) => (name === 'Something' ? 'Thing' : name)),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          something {
            fastField
            ... @defer {
              slowField
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(60);
    expect(mergeIncrementalResults(values)).toEqual({
      data: {
        something: { fastField: 'fast', slowField: 'slow' },
      },
    });
  });

  it('RenameObjectFields on a deferred field', async () => {
    const schema = baseSomethingSchema();
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          transforms: [
            new RenameObjectFields((typeName, fieldName) =>
              typeName === 'Something' && fieldName === 'slowField'
                ? 'delayedField'
                : fieldName,
            ),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          something {
            fastField
            ... @defer {
              delayedField
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(60);
    expect(mergeIncrementalResults(values)).toEqual({
      data: {
        something: { fastField: 'fast', delayedField: 'slow' },
      },
    });
  });

  it('RenameRootFields on a deferred root field', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          something: String
          fast: String
        }
      `,
      resolvers: {
        Query: {
          fast: () => 'fast',
          something: async () => {
            await setTimeout(80);
            return 'slow-root';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          transforms: [
            new RenameRootFields((_type, fieldName) =>
              fieldName === 'something' ? 'thing' : fieldName,
            ),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          fast
          ... @defer {
            thing
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { fast: 'fast' },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(60);
    expect(mergeIncrementalResults(values)).toEqual({
      data: { fast: 'fast', thing: 'slow-root' },
    });
  });

  it('RenameRootTypes with deferred fields', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        schema {
          query: QueryRoot
        }
        type Something {
          fastField: String!
          slowField: String
        }
        type QueryRoot {
          something: Something
        }
      `,
      resolvers: {
        QueryRoot: { something: () => ({}) },
        Something: {
          fastField: () => 'fast',
          slowField: async () => {
            await setTimeout(80);
            return 'slow';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          transforms: [
            new RenameRootTypes((name) =>
              name === 'QueryRoot' ? 'Query' : name,
            ),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          something {
            fastField
            ... @defer {
              slowField
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(60);
    expect(mergeIncrementalResults(values)).toEqual({
      data: {
        something: { fastField: 'fast', slowField: 'slow' },
      },
    });
  });

  it('WrapFields with deferred nested selection', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          street: String
          city: String
        }
        type Query {
          user: User
        }
      `,
      resolvers: {
        Query: {
          user: () => ({ id: '1', street: 'Main St' }),
        },
        User: {
          city: async () => {
            await setTimeout(80);
            return 'Istanbul';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          transforms: [
            new WrapFields('User', ['address'], ['Address'], ['street', 'city']),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          user {
            id
            address {
              street
              ... @defer {
                city
              }
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: {
        user: {
          id: '1',
          address: { street: 'Main St' },
        },
      },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(60);
    expect(mergeIncrementalResults(values)).toEqual({
      data: {
        user: {
          id: '1',
          address: { street: 'Main St', city: 'Istanbul' },
        },
      },
    });
  });

  it('HoistField with a deferred hoisted field', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Outer {
          inner: Inner
        }
        type Inner {
          fast: String
          slow: String
        }
        type Query {
          outer: Outer
        }
      `,
      resolvers: {
        Query: { outer: () => ({ inner: {} }) },
        Inner: {
          fast: () => 'fast',
          slow: async () => {
            await setTimeout(80);
            return 'slow';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          transforms: [
            new HoistField('Outer', ['inner', 'slow'], 'hoistedSlow'),
            new PruneSchema(),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          outer {
            inner {
              fast
            }
            ... @defer {
              hoistedSlow
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { outer: { inner: { fast: 'fast' } } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(60);
    expect(mergeIncrementalResults(values)).toEqual({
      data: {
        outer: {
          inner: { fast: 'fast' },
          hoistedSlow: 'slow',
        },
      },
    });
  });

  it('MapLeafValues maps deferred scalar results', async () => {
    const schema = baseSomethingSchema();
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          transforms: [
            new MapLeafValues(
              (_typeName, value) => value,
              (typeName, value) =>
                typeName === 'String' && value === 'slow'
                  ? 'SLOW_MAPPED'
                  : value,
            ),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          something {
            fastField
            ... @defer {
              slowField
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(60);
    expect(mergeIncrementalResults(values)).toEqual({
      data: {
        something: { fastField: 'fast', slowField: 'SLOW_MAPPED' },
      },
    });
  });

  it('TransformCompositeFields renames a deferred field', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Product {
          _id: ID!
          slowLabel: String
        }
        type Query {
          product: Product
        }
      `,
      resolvers: {
        Query: { product: () => ({ _id: 'p1' }) },
        Product: {
          slowLabel: async () => {
            await setTimeout(80);
            return 'label';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          transforms: [
            new TransformCompositeFields((typeName, fieldName, fieldConfig) => {
              if (typeName === 'Product' && fieldName === '_id') {
                return ['id', fieldConfig];
              }
              if (typeName === 'Product' && fieldName === 'slowLabel') {
                return ['label', fieldConfig];
              }
              return fieldConfig;
            }),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          product {
            id
            ... @defer {
              label
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { product: { id: 'p1' } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(60);
    expect(mergeIncrementalResults(values)).toEqual({
      data: {
        product: { id: 'p1', label: 'label' },
      },
    });
  });

});

describe('transforms with @defer (subgraph-forwarded)', () => {
  it('RenameTypes still streams deferred fields', async () => {
    const schema = baseSomethingSchema({ slowMs: 100 });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: executorFromSchema(schema),
          transforms: [
            new RenameTypes((name) => (name === 'Something' ? 'Thing' : name)),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          something {
            fastField
            ... @defer {
              slowField
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(80);
    expect(mergeIncrementalResults(values)).toMatchObject({
      data: {
        something: { fastField: 'fast', slowField: 'slow' },
      },
    });
  });

  it('RenameObjectFields still streams deferred fields', async () => {
    const schema = baseSomethingSchema({ slowMs: 100 });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: executorFromSchema(schema),
          transforms: [
            new RenameObjectFields((typeName, fieldName) =>
              typeName === 'Something' && fieldName === 'slowField'
                ? 'delayedField'
                : fieldName,
            ),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          something {
            fastField
            ... @defer {
              delayedField
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(80);
    expect(mergeIncrementalResults(values)).toMatchObject({
      data: {
        something: { fastField: 'fast', delayedField: 'slow' },
      },
    });
  });

  it('WrapFields still streams deferred nested fields', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          street: String
          city: String
        }
        type Query {
          user: User
        }
      `,
      resolvers: {
        Query: {
          user: () => ({ id: '1', street: 'Main St' }),
        },
        User: {
          city: async () => {
            await setTimeout(100);
            return 'Istanbul';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: executorFromSchema(schema),
          transforms: [
            new WrapFields('User', ['address'], ['Address'], ['street', 'city']),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          user {
            id
            address {
              street
              ... @defer {
                city
              }
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: {
        user: {
          id: '1',
          address: { street: 'Main St' },
        },
      },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(80);
    expect(mergeIncrementalResults(values)).toMatchObject({
      data: {
        user: {
          id: '1',
          address: { street: 'Main St', city: 'Istanbul' },
        },
      },
    });
  });

  it('HoistField still streams a deferred hoisted field', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Outer {
          inner: Inner
        }
        type Inner {
          fast: String
          slow: String
        }
        type Query {
          outer: Outer
        }
      `,
      resolvers: {
        Query: { outer: () => ({ inner: {} }) },
        Inner: {
          fast: () => 'fast',
          slow: async () => {
            await setTimeout(100);
            return 'slow';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: executorFromSchema(schema),
          transforms: [
            new HoistField('Outer', ['inner', 'slow'], 'hoistedSlow'),
            new PruneSchema(),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          outer {
            inner {
              fast
            }
            ... @defer {
              hoistedSlow
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { outer: { inner: { fast: 'fast' } } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(80);
    expect(mergeIncrementalResults(values)).toMatchObject({
      data: {
        outer: {
          inner: { fast: 'fast' },
          hoistedSlow: 'slow',
        },
      },
    });
  });

  it('TransformCompositeFields still streams deferred renamed fields', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Product {
          _id: ID!
          slowLabel: String
        }
        type Query {
          product: Product
        }
      `,
      resolvers: {
        Query: { product: () => ({ _id: 'p1' }) },
        Product: {
          slowLabel: async () => {
            await setTimeout(100);
            return 'label';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: executorFromSchema(schema),
          transforms: [
            new TransformCompositeFields((typeName, fieldName, fieldConfig) => {
              if (typeName === 'Product' && fieldName === '_id') {
                return ['id', fieldConfig];
              }
              if (typeName === 'Product' && fieldName === 'slowLabel') {
                return ['label', fieldConfig];
              }
              return fieldConfig;
            }),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          product {
            id
            ... @defer {
              label
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { product: { id: 'p1' } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(80);
    expect(mergeIncrementalResults(values)).toMatchObject({
      data: {
        product: { id: 'p1', label: 'label' },
      },
    });
  });

  it('MapLeafValues maps values arriving in deferred patches', async () => {
    const schema = baseSomethingSchema({ slowMs: 100 });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: executorFromSchema(schema),
          transforms: [
            new MapLeafValues(
              (_typeName, value) => value,
              (typeName, value) =>
                typeName === 'String' && value === 'slow'
                  ? 'SLOW_MAPPED'
                  : value,
            ),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          something {
            fastField
            ... @defer {
              slowField
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(80);
    expect(mergeIncrementalResults(values)).toMatchObject({
      data: {
        something: { fastField: 'fast', slowField: 'SLOW_MAPPED' },
      },
    });
  });

  it('surfaces errors from deferred patches', async () => {
    const schema = baseSomethingSchema({ slowMs: 50, boom: true });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: executorFromSchema(schema),
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          something {
            fastField
            ... @defer {
              slowField
            }
          }
        }
      `),
    });
    const { values } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    const merged = mergeIncrementalResults(values);
    expect(merged.errors?.some((e) => e.message.includes('deferred boom'))).toBe(
      true,
    );
  });

  it('stops waiting when the operation is aborted', async () => {
    let slowFinished = false;
    const controller = new AbortController();
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Something {
          fastField: String!
          slowField: String
        }
        type Query {
          something: Something
        }
      `,
      resolvers: {
        Query: { something: () => ({}) },
        Something: {
          fastField: () => 'fast',
          slowField: async (_: unknown, __: unknown, context: any) => {
            try {
              await setTimeout(500, undefined, {
                signal: context?.signal ?? controller.signal,
              });
              slowFinished = true;
              return 'slow';
            } catch {
              return null;
            }
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: executorFromSchema(schema),
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          something {
            fastField
            ... @defer {
              slowField
            }
          }
        }
      `),
      signal: controller.signal,
      contextValue: { signal: controller.signal },
    });
    expect(isAsyncIterable(result)).toBe(true);
    const iterator = (result as AsyncIterable<ExecutionResult>)[
      Symbol.asyncIterator
    ]();
    const first = await iterator.next();
    expect(first.value).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    try {
      controller.abort();
    } catch {
      // ignore
    }
    try {
      await iterator.return?.();
    } catch {
      // abort may reject the iterator
    }
    await setTimeout(100);
    expect(slowFinished).toBe(false);
  });
});

describe('TransformQuery + batch-delegate with @defer', () => {
  function buildBooksUsersSchema(options?: { defer?: boolean }) {
    const bookSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Book {
          id: ID!
          title: String!
          slowBlurb: String
        }
        type UserBooks {
          userId: ID!
          books: [Book!]!
        }
        type Query {
          booksByUserIds(userIds: [ID!]!): [UserBooks!]!
        }
      `,
      resolvers: {
        Query: {
          booksByUserIds: (_root, { userIds }) =>
            userIds.map((userId: string) => ({
              userId,
              books: [
                { id: `${userId}-b1`, title: 'Book 1' },
                { id: `${userId}-b2`, title: 'Book 2' },
              ],
            })),
        },
        Book: {
          slowBlurb: async (book: { id: string }) => {
            await setTimeout(80);
            return `blurb-${book.id}`;
          },
        },
      },
    });

    const userSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: String!
          email: String!
        }
        type Query {
          usersByIds(ids: [ID!]): [User]
        }
      `,
      resolvers: {
        Query: {
          usersByIds: (_root, args) =>
            args.ids.map((id: string) => ({
              id,
              email: `${id}@test.com`,
            })),
        },
      },
    });

    const queryTransform = new TransformQuery({
      path: ['booksByUserIds'],
      queryTransformer: (selectionSet) => ({
        kind: Kind.SELECTION_SET,
        selections: [
          { kind: Kind.FIELD, name: { kind: Kind.NAME, value: 'userId' } },
          {
            kind: Kind.FIELD,
            name: { kind: Kind.NAME, value: 'books' },
            selectionSet,
          },
        ],
      }),
      resultTransformer: (results, delegationContext) => {
        const userIds = delegationContext.args?.['userIds'];
        const booksByUserIds = results.reduce(
          (
            acc: Record<string, unknown>,
            { userId, books }: { userId: string; books: unknown[] },
          ) => {
            acc[userId] = books;
            return acc;
          },
          {},
        );
        return userIds.map((id: string) => booksByUserIds[id]);
      },
      // Unwrap drops the `books` path segment; rewrite deferred patch paths
      // the same way (graphql-tools#1941 TransformQuery + forward).
      errorPathTransformer: (path) => path.filter((p) => p !== 'books'),
    });

    const bookSubschema = options?.defer
      ? {
          schema: bookSchema,
          defer: true,
          executor: executorFromSchema(bookSchema),
        }
      : bookSchema;

    return stitchSchemas({
      subschemas: [bookSubschema, userSchema],
      typeDefs: /* GraphQL */ `
        extend type User {
          books: [Book!]!
        }
      `,
      resolvers: {
        User: {
          books: {
            selectionSet: `{ id }`,
            resolve: (user, _args, context, info) =>
              batchDelegateToSchema({
                schema: bookSubschema,
                operation: 'query' as OperationTypeNode,
                fieldName: 'booksByUserIds',
                key: user.id,
                argsFromKeys: (userIds) => ({ userIds }),
                context,
                info,
                transforms: [queryTransform],
                returnType: new GraphQLList(
                  new GraphQLList(
                    info.schema.getType('Book') as GraphQLObjectType,
                  ),
                ),
              }),
          },
        },
      },
    });
  }

  const deferredBooksQuery = /* GraphQL */ `
    query {
      usersByIds(ids: ["u1", "u2"]) {
        id
        books {
          id
          title
          ... @defer {
            slowBlurb
          }
        }
      }
    }
  `;

  const expectedMergedBooks = {
    usersByIds: [
      {
        id: 'u1',
        books: [
          { id: 'u1-b1', title: 'Book 1', slowBlurb: 'blurb-u1-b1' },
          { id: 'u1-b2', title: 'Book 2', slowBlurb: 'blurb-u1-b2' },
        ],
      },
      {
        id: 'u2',
        books: [
          { id: 'u2-b1', title: 'Book 1', slowBlurb: 'blurb-u2-b1' },
          { id: 'u2-b2', title: 'Book 2', slowBlurb: 'blurb-u2-b2' },
        ],
      },
    ],
  };

  it('gateway-owned: deferred book fields via TransformQuery batch', async () => {
    const schema = buildBooksUsersSchema();
    const result = await normalizedExecutor({
      schema,
      document: parse(deferredBooksQuery),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: {
        usersByIds: [
          {
            id: 'u1',
            books: [
              { id: 'u1-b1', title: 'Book 1' },
              { id: 'u1-b2', title: 'Book 2' },
            ],
          },
          {
            id: 'u2',
            books: [
              { id: 'u2-b1', title: 'Book 1' },
              { id: 'u2-b2', title: 'Book 2' },
            ],
          },
        ],
      },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(60);
    expect(mergeIncrementalResults(values).data).toMatchObject(
      expectedMergedBooks,
    );
  });

  it('forwarded: TransformQuery unwrap rewrites deferred patch paths', async () => {
    const schema = buildBooksUsersSchema({ defer: true });
    const result = await normalizedExecutor({
      schema,
      document: parse(deferredBooksQuery),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: {
        usersByIds: [
          {
            id: 'u1',
            books: [
              { id: 'u1-b1', title: 'Book 1' },
              { id: 'u1-b2', title: 'Book 2' },
            ],
          },
          {
            id: 'u2',
            books: [
              { id: 'u2-b1', title: 'Book 1' },
              { id: 'u2-b2', title: 'Book 2' },
            ],
          },
        ],
      },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(60);
    expect(mergeIncrementalResults(values).data).toMatchObject(
      expectedMergedBooks,
    );
  });
});

describe('transforms with @defer (subgraph-forwarded) - root renames', () => {
  it('RenameRootFields still streams a deferred root field', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          something: String
          fast: String
        }
      `,
      resolvers: {
        Query: {
          fast: () => 'fast',
          something: async () => {
            await setTimeout(100);
            return 'slow-root';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: executorFromSchema(schema),
          transforms: [
            new RenameRootFields((_type, fieldName) =>
              fieldName === 'something' ? 'thing' : fieldName,
            ),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          fast
          ... @defer {
            thing
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { fast: 'fast' },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(80);
    expect(mergeIncrementalResults(values)).toMatchObject({
      data: { fast: 'fast', thing: 'slow-root' },
    });
  });

  it('RenameRootTypes still streams deferred fields', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        schema {
          query: QueryRoot
        }
        type Something {
          fastField: String!
          slowField: String
        }
        type QueryRoot {
          something: Something
        }
      `,
      resolvers: {
        QueryRoot: { something: () => ({}) },
        Something: {
          fastField: () => 'fast',
          slowField: async () => {
            await setTimeout(100);
            return 'slow';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: executorFromSchema(schema),
          transforms: [
            new RenameRootTypes((name) =>
              name === 'QueryRoot' ? 'Query' : name,
            ),
          ],
        },
      ],
    });
    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          something {
            fastField
            ... @defer {
              slowField
            }
          }
        }
      `),
    });
    const { values, timings } = await collectAll(result);
    expect(values[0]).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    expect(timings[0]!).toBeLessThan(80);
    expect(mergeIncrementalResults(values)).toMatchObject({
      data: {
        something: { fastField: 'fast', slowField: 'slow' },
      },
    });
  });
});

