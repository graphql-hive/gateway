import { setTimeout } from 'timers/promises';
import {
  executorFromSchema,
  normalizedExecutor,
} from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { isAsyncIterable } from '@graphql-tools/utils';
import { wrapSchema } from '@graphql-tools/wrap';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { stitchSchemas } from '../src/index.js';

/**
 * Follow-up to #2672 / #2685: wrapping a stitched schema and resolving a
 * deferred field that lives on another inner subschema used to recurse
 * (`Maximum call stack size exceeded`) because `defaultMergedResolver` fell
 * back to the source schema's own field resolver — which was
 * `defaultMergedResolver` again with the same parent.
 */
describe('wrapSchema over stitch + deferred merged field', () => {
  function buildStitched() {
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
          object: (_: unknown, { id }: { id: string }) => ({
            id,
            field1: 'field1',
          }),
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
            await setTimeout(10);
            return { id, field2: 'field2' };
          },
        },
      },
    });
    return stitchSchemas({
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
  }

  async function collect(result: unknown): Promise<
    Array<{
      data?: unknown;
      incremental?: Array<{ data?: unknown; errors?: unknown }>;
      hasNext?: boolean;
    }>
  > {
    const values: Array<{
      data?: unknown;
      incremental?: Array<{ data?: unknown; errors?: unknown }>;
      hasNext?: boolean;
    }> = [];
    if (!isAsyncIterable(result)) {
      values.push(result as (typeof values)[number]);
      return values;
    }
    for await (const v of result) {
      values.push(v as (typeof values)[number]);
    }
    return values;
  }

  it('resolves a deferred field merged from another subschema without recursing', async () => {
    const stitched = buildStitched();
    const wrapped = wrapSchema({ schema: stitched });

    const result = await normalizedExecutor({
      schema: wrapped,
      document: parse(/* GraphQL */ `
        query {
          object(id: "1") {
            id
            field1
            ... @defer {
              field2
            }
          }
        }
      `),
    });

    const values = await collect(result);
    expect(values[0]).toMatchObject({
      data: { object: { id: '1', field1: 'field1' } },
      hasNext: true,
    });
    expect(
      values.some((v) =>
        v.incremental?.some(
          (p) =>
            (p.data as { field2?: string } | undefined)?.field2 === 'field2',
        ),
      ),
    ).toBe(true);
    expect(
      values.flatMap((v) => v.incremental ?? []).flatMap((p) => p.errors ?? []),
    ).toEqual([]);
  });

  it('still delivers deferred patches when the wrap layer forwards @defer', async () => {
    const stitched = buildStitched();
    const wrapped = wrapSchema({
      schema: stitched,
      defer: true,
      executor: executorFromSchema(stitched),
    });

    const result = await normalizedExecutor({
      schema: wrapped,
      document: parse(/* GraphQL */ `
        query {
          object(id: "1") {
            id
            field1
            ... @defer {
              field2
            }
          }
        }
      `),
    });

    const values = await collect(result);
    expect(
      values.some((v) =>
        v.incremental?.some(
          (p) =>
            (p.data as { field2?: string } | undefined)?.field2 === 'field2',
        ),
      ),
    ).toBe(true);
  });
});
