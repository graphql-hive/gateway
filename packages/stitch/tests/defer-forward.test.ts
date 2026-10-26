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

  it('streams nested list fields from a defer-capable subgraph', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Object {
          test: [String]
        }
        type Query {
          object: Object
        }
      `,
      resolvers: {
        Query: { object: () => ({}) },
        Object: {
          test: async function* () {
            yield 'test1';
            await setTimeout(40);
            yield 'test2';
            await setTimeout(40);
            yield 'test3';
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
          object {
            test @stream(initialCount: 1)
          }
        }
      `),
    });

    expect(isAsyncIterable(result)).toBe(true);
    const values: unknown[] = [];
    for await (const v of result as AsyncIterable<unknown>) {
      values.push(v);
    }

    expect(values[0]).toMatchObject({
      data: { object: { test: ['test1'] } },
      hasNext: true,
    });

    const merged: string[] = [];
    for (const value of values) {
      const v = value as {
        data?: { object?: { test?: string[] } };
        incremental?: Array<{
          items?: string[];
          path?: Array<string | number>;
        }>;
      };
      if (v.data?.object?.test) {
        for (const item of v.data.object.test) {
          if (!merged.includes(item)) merged.push(item);
        }
      }
      if (v.incremental) {
        for (const patch of v.incremental) {
          if (patch.items) merged.push(...patch.items);
        }
      }
    }
    expect(merged).toEqual(['test1', 'test2', 'test3']);
  });

  it('streams nested object list items from a defer-capable subgraph', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Item {
          id: ID!
          label: String!
        }
        type Box {
          items: [Item!]!
        }
        type Query {
          box: Box
        }
      `,
      resolvers: {
        Query: { box: () => ({}) },
        Box: {
          items: async function* () {
            yield { id: '1', label: 'one' };
            await setTimeout(30);
            yield { id: '2', label: 'two' };
            await setTimeout(30);
            yield { id: '3', label: 'three' };
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
          box {
            items @stream(initialCount: 1) {
              id
              label
            }
          }
        }
      `),
    });

    expect(isAsyncIterable(result)).toBe(true);
    const values: Array<{
      data?: { box?: { items?: Array<{ id: string; label: string }> } };
      incremental?: Array<{
        items?: Array<{ id: string; label: string }>;
        path?: Array<string | number>;
      }>;
    }> = [];
    for await (const v of result as AsyncIterable<(typeof values)[number]>) {
      values.push(v);
    }

    expect(values[0]).toMatchObject({
      data: { box: { items: [{ id: '1', label: 'one' }] } },
      hasNext: true,
    });

    const merged: Array<{ id: string; label: string }> = [
      ...(values[0]?.data?.box?.items ?? []),
    ];
    for (const value of values.slice(1)) {
      for (const patch of value.incremental ?? []) {
        if (patch.items) merged.push(...patch.items);
        expect(patch.path?.[0]).toBe('box');
        expect(patch.path?.[1]).toBe('items');
      }
    }
    expect(merged).toEqual([
      { id: '1', label: 'one' },
      { id: '2', label: 'two' },
      { id: '3', label: 'three' },
    ]);
  });

  it('delivers deferred fields for every item of a nested list', async () => {
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Item {
          id: ID!
          slowField: String
        }
        type Box {
          items: [Item!]!
        }
        type Query {
          box: Box
        }
      `,
      resolvers: {
        Query: {
          box: () => ({ items: [{ id: '1' }, { id: '2' }, { id: '3' }] }),
        },
        Item: {
          slowField: async ({ id }: { id: string }) => {
            await setTimeout(20);
            return `slow-${id}`;
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
          box {
            items {
              id
              ... @defer {
                slowField
              }
            }
          }
        }
      `),
    });

    expect(isAsyncIterable(result)).toBe(true);
    const values: Array<{
      data?: unknown;
      incremental?: Array<{ data?: unknown; path?: Array<string | number> }>;
      hasNext?: boolean;
    }> = [];
    for await (const v of result as AsyncIterable<(typeof values)[number]>) {
      values.push(v);
    }

    expect(values[0]).toMatchObject({
      data: { box: { items: [{ id: '1' }, { id: '2' }, { id: '3' }] } },
      hasNext: true,
    });
    expect(
      values
        .flatMap((v) => v.incremental ?? [])
        .sort((a, b) => Number(a.path?.[2]) - Number(b.path?.[2])),
    ).toEqual([
      { data: { slowField: 'slow-1' }, path: ['box', 'items', 0] },
      { data: { slowField: 'slow-2' }, path: ['box', 'items', 1] },
      { data: { slowField: 'slow-3' }, path: ['box', 'items', 2] },
    ]);
  });

  it('delivers every patch when the subgraph sends several in one chunk', async () => {
    let releaseSlowFields!: () => void;
    const slowFieldsReleased = new Promise<void>((resolve) => {
      releaseSlowFields = resolve;
    });
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Item {
          id: ID!
          slowField: String
        }
        type Query {
          items: [Item!]!
        }
      `,
      resolvers: {
        Query: {
          items: () => [{ id: '1' }, { id: '2' }, { id: '3' }],
        },
        Item: {
          slowField: async ({ id }: { id: string }) => {
            await slowFieldsReleased;
            return `slow-${id}`;
          },
        },
      },
    });

    const subgraphExecutor = executorFromSchema(schema);
    const subgraphChunks: Array<{ incremental?: ReadonlyArray<unknown> }> = [];
    const gatewaySchema = stitchSchemas({
      subschemas: [
        {
          schema,
          defer: true,
          executor: async (request) => {
            const result = await subgraphExecutor(request);
            if (!isAsyncIterable(result)) {
              return result;
            }
            return (async function* () {
              for await (const chunk of result) {
                subgraphChunks.push(chunk);
                yield chunk;
              }
            })();
          },
        },
      ],
    });

    const result = await normalizedExecutor({
      schema: gatewaySchema,
      document: parse(/* GraphQL */ `
        query {
          items {
            id
            ... @defer {
              slowField
            }
          }
        }
      `),
    });

    expect(isAsyncIterable(result)).toBe(true);
    const values: Array<{
      incremental?: Array<{ data?: unknown; path?: Array<string | number> }>;
    }> = [];
    for await (const v of result as AsyncIterable<(typeof values)[number]>) {
      values.push(v);
      if (values.length === 1) {
        releaseSlowFields();
      }
    }

    expect(subgraphChunks.at(-1)?.incremental).toHaveLength(3);
    expect(
      values
        .flatMap((v) => v.incremental ?? [])
        .sort((a, b) => Number(a.path?.[1]) - Number(b.path?.[1])),
    ).toEqual([
      { data: { slowField: 'slow-1' }, path: ['items', 0] },
      { data: { slowField: 'slow-2' }, path: ['items', 1] },
      { data: { slowField: 'slow-3' }, path: ['items', 2] },
    ]);
  });

  /**
   * Reporter setup from #2685: wrapSchema over a stitched schema, forward
   * `@defer`, nested `@defer` on a field merged from another subgraph under
   * connection paths like `assets.edges.<i>.node`.
   */
  describe('wrapSchema over stitch (merged field under connection path)', () => {
    function buildMergedObjectStitch() {
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
              await setTimeout(15);
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

    function buildConnectionStitch(opts?: {
      gateDescriptions?: Promise<void>;
    }) {
      const catalog = makeExecutableSchema({
        typeDefs: /* GraphQL */ `
          type Asset {
            id: ID!
            name: String!
          }
          type AssetEdge {
            node: Asset!
          }
          type AssetConnection {
            edges: [AssetEdge!]!
          }
          type Query {
            assets: AssetConnection!
            asset(id: ID!): Asset
          }
        `,
        resolvers: {
          Query: {
            assets: () => ({
              edges: [
                { node: { id: '1', name: 'alpha' } },
                { node: { id: '2', name: 'beta' } },
                { node: { id: '3', name: 'gamma' } },
              ],
            }),
            asset: (_: unknown, { id }: { id: string }) => ({
              id,
              name: `name-${id}`,
            }),
          },
        },
      });
      const descriptions = makeExecutableSchema({
        typeDefs: /* GraphQL */ `
          type Asset {
            id: ID!
            description: String
          }
          type Query {
            asset(id: ID!): Asset
          }
        `,
        resolvers: {
          Query: {
            asset: async (_: unknown, { id }: { id: string }) => {
              if (opts?.gateDescriptions) {
                await opts.gateDescriptions;
              } else {
                await setTimeout(20);
              }
              return { id, description: `desc-${id}` };
            },
          },
        },
      });
      return stitchSchemas({
        subschemas: [
          {
            schema: catalog,
            merge: {
              Asset: {
                selectionSet: '{ id }',
                fieldName: 'asset',
                args: ({ id }: { id: string }) => ({ id }),
              },
            },
          },
          {
            schema: descriptions,
            merge: {
              Asset: {
                selectionSet: '{ id }',
                fieldName: 'asset',
                args: ({ id }: { id: string }) => ({ id }),
              },
            },
          },
        ],
      });
    }

    async function collect(result: unknown) {
      const values: Array<{
        data?: unknown;
        incremental?: Array<{
          data?: unknown;
          path?: Array<string | number>;
          errors?: ReadonlyArray<{ message: string }>;
        }>;
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

    function patchesOf(values: Awaited<ReturnType<typeof collect>>) {
      return values.flatMap((v) => v.incremental ?? []);
    }

    function patchErrors(values: Awaited<ReturnType<typeof collect>>) {
      return patchesOf(values).flatMap((p) => p.errors ?? []);
    }

    it('without defer:true resolves a deferred field from another subschema without stack overflow', async () => {
      const stitched = buildMergedObjectStitch();
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
        patchesOf(values).some(
          (p) =>
            (p.data as { field2?: string } | undefined)?.field2 === 'field2',
        ),
      ).toBe(true);
      expect(patchErrors(values).map((e) => e.message)).not.toContain(
        'Maximum call stack size exceeded',
      );
      expect(patchErrors(values)).toEqual([]);
    });

    it('with defer:true forwards nested @defer and delivers the merged field', async () => {
      const stitched = buildMergedObjectStitch();
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
        patchesOf(values).some(
          (p) =>
            (p.data as { field2?: string } | undefined)?.field2 === 'field2',
        ),
      ).toBe(true);
      expect(patchErrors(values)).toEqual([]);
    });

    it('delivers deferred merged fields for every connection edge node', async () => {
      const stitched = buildConnectionStitch();
      const wrapped = wrapSchema({
        schema: stitched,
        defer: true,
        executor: executorFromSchema(stitched),
      });

      const result = await normalizedExecutor({
        schema: wrapped,
        document: parse(/* GraphQL */ `
          query {
            assets {
              edges {
                node {
                  id
                  name
                  ... @defer {
                    description
                  }
                }
              }
            }
          }
        `),
      });

      const values = await collect(result);
      expect(values[0]).toMatchObject({
        data: {
          assets: {
            edges: [
              { node: { id: '1', name: 'alpha' } },
              { node: { id: '2', name: 'beta' } },
              { node: { id: '3', name: 'gamma' } },
            ],
          },
        },
        hasNext: true,
      });
      expect(
        patchesOf(values)
          .filter(
            (p) =>
              (p.data as { description?: string } | undefined)?.description !=
              null,
          )
          .sort((a, b) => Number(a.path?.[2]) - Number(b.path?.[2])),
      ).toEqual([
        {
          data: { description: 'desc-1' },
          path: ['assets', 'edges', 0, 'node'],
        },
        {
          data: { description: 'desc-2' },
          path: ['assets', 'edges', 1, 'node'],
        },
        {
          data: { description: 'desc-3' },
          path: ['assets', 'edges', 2, 'node'],
        },
      ]);
      expect(patchErrors(values)).toEqual([]);
    });

    it('delivers every connection-node patch when several arrive in one chunk', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const stitched = buildConnectionStitch({ gateDescriptions: gate });
      const subgraphExecutor = executorFromSchema(stitched);
      const wrapped = wrapSchema({
        schema: stitched,
        defer: true,
        executor: async (request) => {
          const result = await subgraphExecutor(request);
          if (!isAsyncIterable(result)) {
            return result;
          }
          return (async function* () {
            for await (const chunk of result) {
              yield chunk;
            }
          })();
        },
      });

      const result = await normalizedExecutor({
        schema: wrapped,
        document: parse(/* GraphQL */ `
          query {
            assets {
              edges {
                node {
                  id
                  ... @defer {
                    description
                  }
                }
              }
            }
          }
        `),
      });

      const values: Awaited<ReturnType<typeof collect>> = [];
      for await (const v of result as AsyncIterable<(typeof values)[number]>) {
        values.push(v);
        if (values.length === 1) {
          release();
        }
      }

      expect(
        patchesOf(values)
          .filter(
            (p) =>
              (p.data as { description?: string } | undefined)?.description !=
              null,
          )
          .sort((a, b) => Number(a.path?.[2]) - Number(b.path?.[2])),
      ).toEqual([
        {
          data: { description: 'desc-1' },
          path: ['assets', 'edges', 0, 'node'],
        },
        {
          data: { description: 'desc-2' },
          path: ['assets', 'edges', 1, 'node'],
        },
        {
          data: { description: 'desc-3' },
          path: ['assets', 'edges', 2, 'node'],
        },
      ]);
      expect(patchErrors(values)).toEqual([]);
    });

    it('without defer:true resolves deferred merged fields under connection edges without stack overflow', async () => {
      const stitched = buildConnectionStitch();
      const wrapped = wrapSchema({ schema: stitched });

      const result = await normalizedExecutor({
        schema: wrapped,
        document: parse(/* GraphQL */ `
          query {
            assets {
              edges {
                node {
                  id
                  name
                  ... @defer {
                    description
                  }
                }
              }
            }
          }
        `),
      });

      const values = await collect(result);
      expect(patchErrors(values).map((e) => e.message)).not.toContain(
        'Maximum call stack size exceeded',
      );
      expect(
        patchesOf(values)
          .filter(
            (p) =>
              (p.data as { description?: string } | undefined)?.description !=
              null,
          )
          .sort((a, b) => Number(a.path?.[2]) - Number(b.path?.[2])),
      ).toEqual([
        {
          data: { description: 'desc-1' },
          path: ['assets', 'edges', 0, 'node'],
        },
        {
          data: { description: 'desc-2' },
          path: ['assets', 'edges', 1, 'node'],
        },
        {
          data: { description: 'desc-3' },
          path: ['assets', 'edges', 2, 'node'],
        },
      ]);
    });
  });
});
