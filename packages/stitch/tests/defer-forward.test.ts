import { setTimeout } from 'timers/promises';
import { executorFromSchema, normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { isAsyncIterable } from '@graphql-tools/utils';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { stitchSchemas } from '../src/index.js';

describe('SubschemaConfig.defer - forward @defer to subgraph', () => {
  it('streams nested deferred fields from a defer-capable subgraph', async () => {
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
            await setTimeout(120);
            return 'slow';
          },
        },
      },
    });

    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          // Forward @defer; patches come back via IncrementalReceiver
          defer: true,
          executor: executorFromSchema(schema),
        },
      ],
    });

    const t0 = Date.now();
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

    expect(isAsyncIterable(result)).toBe(true);
    const values: Array<{ t: number; v: unknown }> = [];
    for await (const v of result as AsyncIterable<unknown>) {
      values.push({ t: Date.now() - t0, v });
    }

    expect(values[0]?.v).toMatchObject({
      data: { something: { fastField: 'fast' } },
      hasNext: true,
    });
    expect(values[0]!.t).toBeLessThan(80);
    expect(values.at(-1)!.t).toBeGreaterThanOrEqual(100);

    const last = values.at(-1)!.v as {
      incremental?: Array<{ data?: { slowField?: string } }>;
    };
    expect(
      last.incremental?.some((p) => p.data?.slowField === 'slow') ||
        (values.some(
          (x: any) => x.v?.data?.something?.slowField === 'slow',
        ) as boolean),
    ).toBe(true);
  });

  it('falls back to gateway-owned defer when defer is not set', async () => {
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
            await setTimeout(100);
            return 'slow';
          },
        },
      },
    });

    const gatewaySchema = stitchSchemas({
      subschemas: [{ schema }],
    });

    const t0 = Date.now();
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
    expect(isAsyncIterable(result)).toBe(true);
    const timings: number[] = [];
    for await (const _ of result as AsyncIterable<unknown>) {
      timings.push(Date.now() - t0);
    }
    expect(timings[0]!).toBeLessThan(80);
    expect(timings.at(-1)!).toBeGreaterThanOrEqual(90);
  });
});
