import { setTimeout } from 'timers/promises';
import { inspect } from 'util';
import { normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { asArray, ExecutionResult, isAsyncIterable, mergeDeep } from '@graphql-tools/utils';
import { RenameTypes } from '@graphql-tools/wrap';
import { parse } from 'graphql';
import _ from 'lodash';
import { describe, expect, it } from 'vitest';
import { stitchSchemas } from '../src/index.js';

function mergeIncrementalResults(values: ExecutionResult[]) {
  const result: ExecutionResult = {};
  for (const value of values) {
    if (value.data) {
      if (!result.data) {
        result.data = value.data;
      } else {
        result.data = mergeDeep([result.data, value.data]);
      }
    }
    if (value.errors) {
      result.errors = result.errors || [];
      result.errors = [...result.errors, ...value.errors];
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
          result.errors = result.errors || [];
          result.errors = [...result.errors, ...incremental.errors];
        }
      }
    }
  }
  return result;
}

async function collectIncremental(
  result: unknown,
): Promise<{ values: ExecutionResult[]; timings: number[] }> {
  const t0 = Date.now();
  const values: ExecutionResult[] = [];
  const timings: number[] = [];
  if (!isAsyncIterable(result)) {
    values.push(result as ExecutionResult);
    timings.push(Date.now() - t0);
    return { values, timings };
  }
  for await (const value of result) {
    if ((value as ExecutionResult).incremental?.some((v) => v.errors?.length)) {
      throw new Error(
        `Unexpected on incremental response: ${inspect(value, false, Infinity)}`,
      );
    }
    if ((value as ExecutionResult).errors) {
      throw new Error(`Unexpected error: ${(value as ExecutionResult).errors}`);
    }
    values.push(value as ExecutionResult);
    timings.push(Date.now() - t0);
  }
  return { values, timings };
}

describe('Defer/Stream within stitching', () => {
  describe('single proxied schema', () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Something {
          fastField: String!
          slowField: String
        }
        type Query {
          fastField: String!
          slowField: String
          something: Something
          list: [String]
        }
      `,
      resolvers: {
        Query: {
          fastField: () => 'I am speed',
          slowField: async () => {
            await setTimeout(150);
            return 'I am slow';
          },
          something: () => ({}),
          list: async function* () {
            yield 'a';
            await setTimeout(50);
            yield 'b';
            await setTimeout(50);
            yield 'c';
          },
        },
        Something: {
          fastField: () => 'I am speed',
          slowField: async () => {
            await setTimeout(150);
            return 'I am slow';
          },
        },
      },
    });

    const gatewaySchema = stitchSchemas({ subschemas: [schema] });

    it('defers root fields without waiting for the slow field', async () => {
      const result = await normalizedExecutor({
        schema: gatewaySchema,
        document: parse(/* GraphQL */ `
          query {
            fastField
            ... @defer {
              slowField
            }
          }
        `),
      });
      const { values, timings } = await collectIncremental(result);
      expect(values[0]).toMatchObject({
        data: { fastField: 'I am speed' },
        hasNext: true,
      });
      expect(timings[0]!).toBeLessThan(100);
      expect(timings.at(-1)!).toBeGreaterThanOrEqual(140);
      expect(mergeIncrementalResults(values)).toEqual({
        data: {
          fastField: 'I am speed',
          slowField: 'I am slow',
        },
      });
    });

    it('defers nested proxied fields without waiting for the slow field', async () => {
      // Regression for https://github.com/graphql-hive/gateway/discussions/845
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
      const { values, timings } = await collectIncremental(result);
      expect(values[0]).toMatchObject({
        data: { something: { fastField: 'I am speed' } },
        hasNext: true,
      });
      // Initial payload must flush before the deferred nested field resolves
      expect(timings[0]!).toBeLessThan(100);
      expect(timings.at(-1)!).toBeGreaterThanOrEqual(140);
      expect(values.length).toBeGreaterThan(1);
      expect(mergeIncrementalResults(values)).toEqual({
        data: {
          something: {
            fastField: 'I am speed',
            slowField: 'I am slow',
          },
        },
      });
    });

    it('streams list fields', async () => {
      const result = await normalizedExecutor({
        schema: gatewaySchema,
        document: parse(/* GraphQL */ `
          query {
            list @stream(initialCount: 1)
          }
        `),
      });
      const { values } = await collectIncremental(result);
      expect(values[0]).toMatchObject({
        data: { list: ['a'] },
        hasNext: true,
      });
      expect(mergeIncrementalResults(values)).toEqual({
        data: { list: ['a', 'b', 'c'] },
      });
    });

    it('streams nested proxied list fields (graphql-tools#1941)', async () => {
      // Gateway-owned: nested @stream is stripped from the subgraph request so
      // the full list resolves in one shot and graphql-js streams locally.
      const nestedSchema = makeExecutableSchema({
        typeDefs: /* GraphQL */ `
          type Object {
            test: [String]
          }
          type Query {
            object: Object
          }
        `,
        resolvers: {
          Object: {
            test: () => ['test1', 'test2'],
          },
          Query: {
            object: () => ({}),
          },
        },
      });
      const nestedGateway = stitchSchemas({ subschemas: [nestedSchema] });
      const result = await normalizedExecutor({
        schema: nestedGateway,
        document: parse(/* GraphQL */ `
          query {
            object {
              test @stream(initialCount: 1)
            }
          }
        `),
      });
      const { values } = await collectIncremental(result);
      expect(values[0]).toMatchObject({
        data: { object: { test: ['test1'] } },
        hasNext: true,
      });
      expect(mergeIncrementalResults(values)).toEqual({
        data: { object: { test: ['test1', 'test2'] } },
      });
    });
  });

  describe('merged deferred patches from multiple subschemas', () => {
    const schema1 = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Object {
          id: ID!
          field1: String
        }
        type Query {
          object(id: ID!): Object
        }
      `,
      resolvers: {
        Query: {
          object: async (_: unknown, { id }: { id: string }) => {
            await setTimeout(80);
            return { id, field1: 'field1' };
          },
        },
      },
    });

    const schema2 = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Object {
          id: ID!
          field2: String
        }
        type Query {
          object(id: ID!): Object
        }
      `,
      resolvers: {
        Query: {
          object: async (_: unknown, { id }: { id: string }) => {
            await setTimeout(160);
            return { id, field2: 'field2' };
          },
        },
      },
    });

    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema: schema1,
          merge: {
            Object: {
              selectionSet: '{ id }',
              fieldName: 'object',
              args: ({ id }: { id: string }) => ({ id }),
            },
          },
        },
        {
          schema: schema2,
          merge: {
            Object: {
              selectionSet: '{ id }',
              fieldName: 'object',
              args: ({ id }: { id: string }) => ({ id }),
            },
          },
        },
      ],
    });

    it('merges deferred fields from multiple subschemas', async () => {
      const result = await normalizedExecutor({
        schema: gatewaySchema,
        document: parse(/* GraphQL */ `
          query {
            object(id: "1") {
              id
              ... @defer {
                field1
                field2
              }
            }
          }
        `),
      });
      const { values, timings } = await collectIncremental(result);
      expect(values[0]).toMatchObject({
        data: { object: { id: '1' } },
        hasNext: true,
      });
      expect(timings[0]!).toBeLessThan(150);
      expect(mergeIncrementalResults(values)).toEqual({
        data: {
          object: {
            id: '1',
            field1: 'field1',
            field2: 'field2',
          },
        },
      });
    });

    it('merges nested deferred fields from multiple subschemas independently', async () => {
      const schemaA = makeExecutableSchema({
        typeDefs: /* GraphQL */ `
          type Object {
            field: Subtype
          }
          type Subtype {
            id: ID!
            subfield1: String
          }
          type Query {
            object: Object
            field(id: ID!): Subtype
          }
        `,
        resolvers: {
          Query: {
            object: () => ({ field: { id: '1' } }),
            field: async (_: unknown, { id }: { id: string }) => {
              await setTimeout(80);
              return { id, subfield1: 'subfield1' };
            },
          },
        },
      });

      const schemaB = makeExecutableSchema({
        typeDefs: /* GraphQL */ `
          type Object {
            field: Subtype
          }
          type Subtype {
            id: ID!
            subfield2: String
          }
          type Query {
            object: Object
            field(id: ID!): Subtype
          }
        `,
        resolvers: {
          Query: {
            object: () => ({ field: { id: '1' } }),
            field: async (_: unknown, { id }: { id: string }) => {
              await setTimeout(160);
              return { id, subfield2: 'subfield2' };
            },
          },
        },
      });

      const stitched = stitchSchemas({
        subschemas: [
          {
            schema: schemaA,
            merge: {
              Subtype: {
                selectionSet: '{ id }',
                fieldName: 'field',
                args: ({ id }: { id: string }) => ({ id }),
              },
            },
          },
          {
            schema: schemaB,
            merge: {
              Subtype: {
                selectionSet: '{ id }',
                fieldName: 'field',
                args: ({ id }: { id: string }) => ({ id }),
              },
            },
          },
        ],
      });

      // Keep the merge key (`id`) outside @defer so the parent object can be
      // established; deferred selections from each subschema then resolve as
      // independent incremental patches across stitched schemas.
      const result = await normalizedExecutor({
        schema: stitched,
        document: parse(/* GraphQL */ `
          query {
            object {
              field {
                id
                ... @defer {
                  subfield1
                }
                ... @defer {
                  subfield2
                }
              }
            }
          }
        `),
      });
      const { values, timings } = await collectIncremental(result);
      expect(values[0]).toMatchObject({
        data: { object: { field: { id: '1' } } },
        hasNext: true,
      });
      expect(timings[0]!).toBeLessThan(80);
      expect(values.length).toBeGreaterThan(1);
      expect(mergeIncrementalResults(values)).toEqual({
        data: {
          object: {
            field: {
              id: '1',
              subfield1: 'subfield1',
              subfield2: 'subfield2',
            },
          },
        },
      });
    });
  });

  describe('errors in deferred patches', () => {
    it('surfaces resolver errors on deferred fields', async () => {
      const schema = makeExecutableSchema({
        typeDefs: /* GraphQL */ `
          type Something {
            fastField: String!
            boom: String
          }
          type Query {
            something: Something
          }
        `,
        resolvers: {
          Query: {
            something: () => ({}),
          },
          Something: {
            fastField: () => 'ok',
            boom: async () => {
              await setTimeout(50);
              throw new Error('deferred boom');
            },
          },
        },
      });
      const gatewaySchema = stitchSchemas({ subschemas: [schema] });
      const result = await normalizedExecutor({
        schema: gatewaySchema,
        document: parse(/* GraphQL */ `
          query {
            something {
              fastField
              ... @defer {
                boom
              }
            }
          }
        `),
      });
      expect(isAsyncIterable(result)).toBe(true);
      const values: ExecutionResult[] = [];
      for await (const value of result as AsyncIterable<ExecutionResult>) {
        values.push(value);
      }
      expect(values[0]).toMatchObject({
        data: { something: { fastField: 'ok' } },
        hasNext: true,
      });
      const merged = mergeIncrementalResults(values);
      expect(merged.errors?.some((e) => e.message.includes('deferred boom'))).toBe(
        true,
      );
    });
  });

  describe('transforms with deferred fields', () => {
    it('works with RenameTypes on deferred nested fields', async () => {
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
              new RenameTypes((name: string) =>
                name === 'Something' ? 'Thing' : name,
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
      const { values, timings } = await collectIncremental(result);
      expect(values[0]).toMatchObject({
        data: { something: { fastField: 'fast' } },
        hasNext: true,
      });
      expect(timings[0]!).toBeLessThan(60);
      expect(mergeIncrementalResults(values)).toEqual({
        data: {
          something: {
            fastField: 'fast',
            slowField: 'slow',
          },
        },
      });
    });
  });

  describe('cancellation / timeouts', () => {
    it('stops waiting for deferred fields when AbortSignal.timeout fires', async () => {
      let slowFinished = false;
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
            slowField: async (_root, _args, _ctx, info) => {
              try {
                await setTimeout(500, undefined, { signal: info.signal });
                slowFinished = true;
                return 'slow';
              } catch {
                return null;
              }
            },
          },
        },
      });
      const gatewaySchema = stitchSchemas({ subschemas: [schema] });
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
        signal: AbortSignal.timeout(40),
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
        await iterator.next();
      } catch {
        // timeout may reject subsequent pulls
      }
      await iterator.return?.();
      await setTimeout(100);
      expect(slowFinished).toBe(false);
    });

    it('stops waiting for deferred fields when the operation is aborted', async () => {
      let slowStarted = false;
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
            slowField: async () => {
              slowStarted = true;
              try {
                await setTimeout(500, undefined, {
                  signal: controller.signal,
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
      const gatewaySchema = stitchSchemas({ subschemas: [schema] });
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
      controller.abort();
      await iterator.return?.();
      await setTimeout(100);
      expect(slowStarted).toBe(true);
      expect(slowFinished).toBe(false);
    });
  });
});
