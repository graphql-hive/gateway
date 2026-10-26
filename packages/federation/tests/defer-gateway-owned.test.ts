import { setTimeout } from 'timers/promises';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { ExecutionResult, isAsyncIterable } from '@graphql-tools/utils';
import { useDeferStream } from '@graphql-yoga/plugin-defer-stream';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { GraphQLSchema, Kind, parse, print, visit } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getStitchedSchemaFromSupergraphSdl } from '../src/supergraph';

/**
 * Gateway-owned `@defer` (the default since #2672) on fields that live in the *same*
 * subgraph as their parent.
 *
 * The gateway strips a deferred selection from the subgraph request so the initial
 * payload can flush, and fetches it again afterwards through the parent's entity
 * resolver. That only works when the parent can be fetched again: the representation
 * needs the key, and the type needs a key at all. Each case below is a shape where one of
 * those does not hold, plus `@defer(if: false)`, which must behave as if there were no
 * `@defer`. In every one the client asked for a field and must get its value.
 */
const SLOW_MS = 200;

describe('gateway-owned @defer on fields of the same subgraph', () => {
  const catalog = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        product(id: ID!): Product
        products: [Product!]!
        box: Box
      }

      type Product @key(fields: "id") {
        id: ID!
        name: String!
        description: String!
        summary: String
      }

      """
      A value type with no key. The gateway cannot fetch it again, so a deferred field
      on it has to stay in the original subgraph request.
      """
      type Box {
        label: String!
        contents: String!
      }
    `),
    resolvers: {
      Query: {
        product: (_: unknown, { id }: { id: string }) => ({ id }),
        products: () => [{ id: 'p1' }, { id: 'p2' }],
        box: () => ({}),
      },
      Product: {
        __resolveReference: (ref: { id: string }) => ({ id: ref.id }),
        name: (p: { id: string }) => `Product ${p.id}`,
        description: async (p: { id: string }) => {
          await setTimeout(SLOW_MS);
          return `Description of ${p.id}`;
        },
        summary: async (p: { id: string }) => {
          await setTimeout(SLOW_MS);
          return `Summary of ${p.id}`;
        },
      },
      Box: {
        label: () => 'Box',
        contents: async () => {
          await setTimeout(SLOW_MS);
          return 'Contents';
        },
      },
    },
  });
  const server = createYoga({ schema: catalog, plugins: [useDeferStream()] });
  const disposableStack = new AsyncDisposableStack();
  const subgraphRequests: string[] = [];
  let schema: GraphQLSchema;

  beforeAll(async () => {
    const supergraphSdl = await composeLocalSchemasWithApollo([
      { name: 'catalog', schema: catalog },
    ]);
    schema = getStitchedSchemaFromSupergraphSdl({
      supergraphSdl,
      onSubschemaConfig(subschemaConfig) {
        const executor = disposableStack.use(
          buildHTTPExecutor({
            endpoint: 'http://localhost:4001/graphql',
            fetch: server.fetch,
          }),
        );
        subschemaConfig.executor = (request) => {
          subgraphRequests.push(print(request.document));
          return executor(request);
        };
      },
    });
  });

  afterAll(() => disposableStack.disposeAsync());

  beforeEach(() => {
    subgraphRequests.length = 0;
  });

  async function collect(
    query: string,
    variableValues?: Record<string, unknown>,
  ): Promise<Array<{ atMs: number; value: ExecutionResult }>> {
    const started = Date.now();
    const result = await normalizedExecutor({
      schema,
      document: parse(query),
      variableValues,
      // A fresh context per operation, as the gateway gives every request. The
      // entity loaders are cached per context.
      contextValue: {},
    });
    const parts: Array<{ atMs: number; value: ExecutionResult }> = [];
    if (isAsyncIterable(result)) {
      for await (const value of result) {
        parts.push({ atMs: Date.now() - started, value });
      }
    } else {
      parts.push({ atMs: Date.now() - started, value: result });
    }
    return parts;
  }

  /** The field names selected directly under `fieldName`, in a printed subgraph request. */
  function selectedUnder(document: string, fieldName: string): string[] {
    const names: string[] = [];
    visit(parse(document), {
      Field(node) {
        if (node.name.value !== fieldName) return;
        const walk = (selections: readonly any[]) => {
          for (const selection of selections) {
            if (selection.kind === Kind.FIELD) names.push(selection.name.value);
            else if (selection.kind === Kind.INLINE_FRAGMENT)
              walk(selection.selectionSet.selections);
          }
        };
        walk(node.selectionSet?.selections ?? []);
      },
    });
    return names;
  }

  function errorsOf(parts: Array<{ value: ExecutionResult }>) {
    return parts.flatMap(({ value }) => [
      ...(value.errors ?? []),
      ...((value as any).incremental ?? []).flatMap(
        (incremental: any) => incremental.errors ?? [],
      ),
    ]);
  }

  it('delivers a deferred non-null field when the client did not select the key', async () => {
    const parts = await collect(/* GraphQL */ `
      query {
        product(id: "p1") {
          name
          ... @defer {
            description
          }
        }
      }
    `);
    expect(errorsOf(parts)).toEqual([]);
    expect(parts[0]!.value.data).toEqual({ product: { name: 'Product p1' } });
    expect(parts.at(-1)!.value).toMatchObject({
      incremental: [
        { data: { description: 'Description of p1' }, path: ['product'] },
      ],
      hasNext: false,
    });
  });

  it('flushes the initial payload before the deferred field resolves', async () => {
    const parts = await collect(/* GraphQL */ `
      query {
        product(id: "p1") {
          name
          ... @defer {
            description
          }
        }
      }
    `);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]!.atMs).toBeLessThan(SLOW_MS);
    expect(parts.at(-1)!.atMs).toBeGreaterThanOrEqual(SLOW_MS - 20);
  });

  it('selects the key, and not the deferred field, in the initial subgraph request', async () => {
    await collect(/* GraphQL */ `
      query {
        product(id: "p1") {
          name
          ... @defer {
            description
          }
        }
      }
    `);
    expect(selectedUnder(subgraphRequests[0]!, 'product')).toEqual(
      expect.arrayContaining(['id', 'name']),
    );
    expect(selectedUnder(subgraphRequests[0]!, 'product')).not.toContain(
      'description',
    );
  });

  it('does not turn a deferred nullable field into a silent null', async () => {
    const parts = await collect(/* GraphQL */ `
      query {
        product(id: "p1") {
          name
          ... @defer {
            summary
          }
        }
      }
    `);
    expect(errorsOf(parts)).toEqual([]);
    expect(parts.at(-1)!.value).toMatchObject({
      incremental: [{ data: { summary: 'Summary of p1' }, path: ['product'] }],
    });
  });

  it('delivers the deferred field for every element of a list', async () => {
    const parts = await collect(/* GraphQL */ `
      query {
        products {
          name
          ... @defer {
            description
          }
        }
      }
    `);
    expect(errorsOf(parts)).toEqual([]);
    const delivered = parts
      .flatMap(({ value }) => (value as any).incremental ?? [])
      .map((incremental: any) => [incremental.path, incremental.data]);
    expect(delivered).toEqual(
      expect.arrayContaining([
        [['products', 0], { description: 'Description of p1' }],
        [['products', 1], { description: 'Description of p2' }],
      ]),
    );
  });

  it('keeps a deferred field of a type without a key in the subgraph request', async () => {
    const parts = await collect(/* GraphQL */ `
      query {
        box {
          label
          ... @defer {
            contents
          }
        }
      }
    `);
    expect(errorsOf(parts)).toEqual([]);
    expect(parts.at(-1)!.value).toMatchObject({
      incremental: [{ data: { contents: 'Contents' }, path: ['box'] }],
    });
  });

  it('keeps the label on a labelled deferred fragment, with its value', async () => {
    const parts = await collect(/* GraphQL */ `
      query {
        product(id: "p1") {
          name
          ... @defer(label: "slow") {
            description
          }
        }
      }
    `);
    expect(errorsOf(parts)).toEqual([]);
    expect(parts.at(-1)!.value).toMatchObject({
      incremental: [
        {
          label: 'slow',
          data: { description: 'Description of p1' },
          path: ['product'],
        },
      ],
    });
  });

  it('delivers a field deferred through a named fragment spread', async () => {
    const parts = await collect(/* GraphQL */ `
      query {
        product(id: "p1") {
          name
          ...Slow @defer
        }
      }
      fragment Slow on Product {
        description
      }
    `);
    expect(errorsOf(parts)).toEqual([]);
    expect(parts.at(-1)!.value).toMatchObject({
      incremental: [
        { data: { description: 'Description of p1' }, path: ['product'] },
      ],
    });
  });

  it('treats @defer(if: false) as no @defer at all', async () => {
    const parts = await collect(/* GraphQL */ `
      query {
        product(id: "p1") {
          name
          ... @defer(if: false) {
            description
          }
        }
      }
    `);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.value).toEqual({
      data: {
        product: { name: 'Product p1', description: 'Description of p1' },
      },
    });
  });

  it('treats @defer(if: $flag) with $flag = false as no @defer at all', async () => {
    const parts = await collect(
      /* GraphQL */ `
        query ($flag: Boolean!) {
          product(id: "p1") {
            name
            ... @defer(if: $flag) {
              description
            }
          }
        }
      `,
      { flag: false },
    );
    expect(parts).toHaveLength(1);
    expect(parts[0]!.value).toEqual({
      data: {
        product: { name: 'Product p1', description: 'Description of p1' },
      },
    });
  });

  it('still works when the client selected the key itself', async () => {
    // Passes before the fix: the representation has the key, so the refetch works.
    // Kept so the fix cannot regress the case that already worked.
    const parts = await collect(/* GraphQL */ `
      query {
        product(id: "p1") {
          id
          name
          ... @defer {
            description
          }
        }
      }
    `);
    expect(errorsOf(parts)).toEqual([]);
    expect(parts[0]!.value.data).toEqual({
      product: { id: 'p1', name: 'Product p1' },
    });
    expect(parts.at(-1)!.value).toMatchObject({
      incremental: [
        { data: { description: 'Description of p1' }, path: ['product'] },
      ],
    });
  });

  it('does not return the key the gateway added for itself', async () => {
    const parts = await collect(/* GraphQL */ `
      query {
        product(id: "p1") {
          name
          ... @defer {
            description
          }
        }
      }
    `);
    expect(JSON.stringify(parts.map(({ value }) => value))).not.toMatch(/"id"/);
  });
});
