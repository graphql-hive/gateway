import { Logger } from '@graphql-hive/logger';
import { createDeferredPromise } from '@whatwg-node/promise-helpers';
import { GraphQLSchema } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import {
  UnifiedGraphManager,
  type UnifiedGraphHandler,
  type UnifiedGraphManagerOptions,
} from '../src/unifiedGraphManager';

const sdlA = 'type Query { a: String }';
const sdlB = 'type Query { b: String }';

const passthroughHandler: UnifiedGraphHandler = ({ unifiedGraph }) => ({
  unifiedGraph,
  getSubgraphSchema: () => unifiedGraph,
});

// the manager returns synchronously when it can
const reload = async (manager: UnifiedGraphManager<unknown>) =>
  manager.invalidateUnifiedGraph();

function createManager(opts: Partial<UnifiedGraphManagerOptions<unknown>>) {
  const onUnifiedGraphChange =
    vi.fn<
      (
        schema: GraphQLSchema,
        metadata: Record<string, unknown> | undefined,
      ) => void
    >();
  const onUnifiedGraphMetadataChange =
    vi.fn<
      (
        schema: GraphQLSchema,
        metadata: Record<string, unknown> | undefined,
      ) => void
    >();
  const manager = new UnifiedGraphManager({
    getUnifiedGraph: () => sdlA,
    handleUnifiedGraph: passthroughHandler,
    onUnifiedGraphChange,
    onUnifiedGraphMetadataChange,
    ...opts,
  });
  return { manager, onUnifiedGraphChange, onUnifiedGraphMetadataChange };
}

describe('Unified graph metadata', () => {
  it('accepts plain graphs without metadata', async () => {
    const { manager, onUnifiedGraphChange, onUnifiedGraphMetadataChange } =
      createManager({ getUnifiedGraph: () => sdlA });
    await using _ = manager;
    const schema = await manager.getUnifiedGraph();
    expect(onUnifiedGraphChange).toHaveBeenCalledTimes(1);
    expect(onUnifiedGraphChange).toHaveBeenCalledWith(schema, undefined);
    await manager.invalidateUnifiedGraph();
    expect(onUnifiedGraphChange).toHaveBeenCalledTimes(1);
    expect(onUnifiedGraphMetadataChange).not.toHaveBeenCalled();
  });

  it('notifies about changed and removed metadata of an unchanged graph', async () => {
    let metadata: Record<string, unknown> | undefined = { version: '1' };
    const { manager, onUnifiedGraphChange, onUnifiedGraphMetadataChange } =
      createManager({
        getUnifiedGraph: () =>
          metadata ? { graph: sdlA, metadata: { ...metadata } } : sdlA,
      });
    await using _ = manager;
    const schema = await manager.getUnifiedGraph();
    expect(onUnifiedGraphChange).toHaveBeenCalledTimes(1);
    expect(onUnifiedGraphChange).toHaveBeenCalledWith(schema, {
      version: '1',
    });

    // same metadata, nothing to notify
    await manager.invalidateUnifiedGraph();
    expect(onUnifiedGraphMetadataChange).not.toHaveBeenCalled();

    metadata = { version: '2' };
    await expect(reload(manager)).resolves.toBe(schema);
    expect(onUnifiedGraphMetadataChange).toHaveBeenLastCalledWith(schema, {
      version: '2',
    });

    metadata = { version: null };
    await manager.invalidateUnifiedGraph();
    expect(onUnifiedGraphMetadataChange).toHaveBeenLastCalledWith(schema, {
      version: null,
    });

    metadata = undefined;
    await manager.invalidateUnifiedGraph();
    expect(onUnifiedGraphMetadataChange).toHaveBeenLastCalledWith(
      schema,
      undefined,
    );

    expect(onUnifiedGraphMetadataChange).toHaveBeenCalledTimes(3);
    expect(onUnifiedGraphChange).toHaveBeenCalledTimes(1);
  });

  it('notifies about the metadata of a cache loaded graph on first identical fetch', async () => {
    const log = new Logger({ level: false });
    const { manager, onUnifiedGraphChange, onUnifiedGraphMetadataChange } =
      createManager({
        getUnifiedGraph: () => ({ graph: sdlA, metadata: { version: '1' } }),
        transportContext: {
          log,
          cache: {
            get: () => sdlA,
            set: () => {},
            delete: () => true,
            getKeysByPrefix: () => [],
          },
        },
      });
    await using _ = manager;
    const schema = await manager.getUnifiedGraph();
    expect(onUnifiedGraphChange).toHaveBeenCalledTimes(1);
    expect(onUnifiedGraphChange).toHaveBeenCalledWith(schema, undefined);

    await expect(reload(manager)).resolves.toBe(schema);
    expect(onUnifiedGraphChange).toHaveBeenCalledTimes(1);
    expect(onUnifiedGraphMetadataChange).toHaveBeenCalledTimes(1);
    expect(onUnifiedGraphMetadataChange).toHaveBeenCalledWith(schema, {
      version: '1',
    });
  });

  it('keeps the metadata of the served graph when loading a new graph fails', async () => {
    let loaded = { graph: sdlA, metadata: { version: 'A' } };
    const { manager, onUnifiedGraphChange, onUnifiedGraphMetadataChange } =
      createManager({
        getUnifiedGraph: () => loaded,
        handleUnifiedGraph(opts) {
          if (opts.unifiedGraph.getQueryType()?.getFields()['b']) {
            throw new Error('Broken graph');
          }
          return passthroughHandler(opts);
        },
      });
    await using _ = manager;
    const schemaA = await manager.getUnifiedGraph();

    loaded = { graph: sdlB, metadata: { version: 'B' } };
    // repeated, the same failing graph must not be treated as the served one
    await expect(reload(manager)).rejects.toThrow('Broken graph');
    await expect(reload(manager)).rejects.toThrow('Broken graph');
    await expect(Promise.resolve(manager.getUnifiedGraph())).resolves.toBe(
      schemaA,
    );

    loaded = { graph: sdlA, metadata: { version: 'A' } };
    await expect(reload(manager)).resolves.toBe(schemaA);

    expect(onUnifiedGraphChange).toHaveBeenCalledTimes(1);
    expect(onUnifiedGraphChange).toHaveBeenCalledWith(schemaA, {
      version: 'A',
    });
    expect(onUnifiedGraphMetadataChange).not.toHaveBeenCalled();
  });

  it('keeps the metadata local to each concurrent load', async () => {
    const handlingA = createDeferredPromise<void>();
    const loads = [
      { graph: sdlA, metadata: { version: 'A' } },
      { graph: sdlB, metadata: { version: 'B' } },
    ];
    const { manager, onUnifiedGraphChange } = createManager({
      getUnifiedGraph: () => loads.shift()!,
      async handleUnifiedGraph(opts) {
        if (opts.unifiedGraph.getQueryType()?.getFields()['a']) {
          await handlingA.promise;
        }
        return passthroughHandler(opts);
      },
    });
    await using _ = manager;

    const loadA = manager.invalidateUnifiedGraph();
    const schemaB = await manager.invalidateUnifiedGraph();
    handlingA.resolve();
    const schemaA = await loadA;

    expect(onUnifiedGraphChange.mock.calls).toEqual([
      [schemaB, { version: 'B' }],
      [schemaA, { version: 'A' }],
    ]);
  });
});
