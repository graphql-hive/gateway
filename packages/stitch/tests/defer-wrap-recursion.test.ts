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

type IncrementalValue = {
  data?: unknown;
  incremental?: Array<{
    data?: unknown;
    path?: Array<string | number>;
    errors?: ReadonlyArray<{ message: string }>;
  }>;
  hasNext?: boolean;
};

async function collect(result: unknown): Promise<IncrementalValue[]> {
  const values: IncrementalValue[] = [];
  if (!isAsyncIterable(result)) {
    values.push(result as IncrementalValue);
    return values;
  }
  for await (const v of result) {
    values.push(v as IncrementalValue);
  }
  return values;
}

function patchesOf(values: IncrementalValue[]) {
  return values.flatMap((v) => v.incremental ?? []);
}

function patchErrors(values: IncrementalValue[]) {
  return patchesOf(values).flatMap((p) => p.errors ?? []);
}

/**
 * Reproductions for #2685 / discussion #845 follow-ups on top of #2672.
 *
 * Production shape reported by the user: wrapSchema over a stitched schema,
 * forward `@defer` into the stitch, nested `@defer` on a field merged from
 * another subgraph under connection paths like `assets.edges.<i>.node`.
 */
describe('wrapSchema over stitch + deferred merged field (#2685)', () => {
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

  /**
   * Connection-shaped stitch matching the reporter's
   * `assets.edges.<i>.node` path: Asset lives on schema A; deferred
   * `description` is merged from schema B.
   */
  function buildConnectionStitch(opts?: {
    /** Resolve all deferred descriptions together (multi-patch chunk). */
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
        (p) => (p.data as { field2?: string } | undefined)?.field2 === 'field2',
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
        (p) => (p.data as { field2?: string } | undefined)?.field2 === 'field2',
      ),
    ).toBe(true);
    expect(patchErrors(values)).toEqual([]);
  });

  it('delivers deferred merged fields for every connection edge node (assets.edges.i.node)', async () => {
    // Reporter setup: wrapSchema → stitched schema, SubschemaConfig.defer,
    // nested @defer on a field merged from another subgraph under a
    // connection path. Before #2685 this yielded description: null per edge.
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

    const descriptionPatches = patchesOf(values)
      .filter(
        (p) =>
          (p.data as { description?: string } | undefined)?.description != null,
      )
      .sort((a, b) => Number(a.path?.[2]) - Number(b.path?.[2]));

    expect(descriptionPatches).toEqual([
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

  it('delivers every connection-node patch when the stitch returns several in one chunk', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stitched = buildConnectionStitch({ gateDescriptions: gate });
    const subgraphExecutor = executorFromSchema(stitched);
    const subgraphChunks: Array<{ incremental?: ReadonlyArray<unknown> }> = [];
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
            subgraphChunks.push(chunk);
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

    const values: IncrementalValue[] = [];
    for await (const v of result as AsyncIterable<IncrementalValue>) {
      values.push(v);
      if (values.length === 1) {
        release();
      }
    }

    // Several edge patches may arrive together once the gate opens; every
    // description must still surface (hasNext must not truncate siblings).
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

describe('discussion #845 nested @defer early flush', () => {
  it('flushes nested deferred fields without waiting for the slow sibling (gateway-owned)', async () => {
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
          fastField: () => 'I am speed',
          slowField: async () => {
            await setTimeout(120);
            return 'I am slow';
          },
        },
      },
    });
    const gatewaySchema = stitchSchemas({ subschemas: [schema] });

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

    const values: Array<{ t: number; v: IncrementalValue }> = [];
    for await (const v of result as AsyncIterable<IncrementalValue>) {
      values.push({ t: Date.now() - t0, v });
    }

    expect(values[0]?.v).toMatchObject({
      data: { something: { fastField: 'I am speed' } },
      hasNext: true,
    });
    expect(values[0]!.t).toBeLessThan(80);
    expect(values.at(-1)!.t).toBeGreaterThanOrEqual(100);
    expect(
      patchesOf(values.map((x) => x.v)).some(
        (p) =>
          (p.data as { slowField?: string } | undefined)?.slowField ===
          'I am slow',
      ),
    ).toBe(true);
  });
});
