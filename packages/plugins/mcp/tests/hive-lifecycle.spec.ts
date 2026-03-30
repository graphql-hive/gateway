import { createLoggerFromLogging } from '@graphql-hive/gateway-runtime';
import { buildSchema } from 'graphql';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HiveDocument, HiveLoader } from '../src/hive-loader.js';
import { useMCP } from '../src/plugin.js';

const testCtx = { log: createLoggerFromLogging(false), fetch: globalThis.fetch };

const mockCreateHiveLoader = vi.fn<(...args: unknown[]) => HiveLoader>();
vi.mock('../src/hive-loader.js', () => ({
  createHiveLoader: (...args: unknown[]) => mockCreateHiveLoader(...args),
}));

const minimalSchema = buildSchema(`
  type Query {
    hello: String
  }
`);

function createMockLoader(overrides?: Partial<HiveLoader>): HiveLoader & {
  fetchDocuments: ReturnType<typeof vi.fn>;
  startPolling: ReturnType<typeof vi.fn>;
  stopPolling: ReturnType<typeof vi.fn>;
} {
  return {
    fetchDocuments: vi.fn(async () => []),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    ...overrides,
  } as ReturnType<typeof createMockLoader>;
}

function callOnRequest(plugin: ReturnType<typeof useMCP>, path = '/mcp') {
  const endResponse = vi.fn();
  const requestHandler = vi.fn();
  const promise = (plugin as any).onRequest({
    request: new Request(`http://localhost${path}`, {
      method: 'POST',
      body: '{}',
    }),
    url: new URL(`http://localhost${path}`),
    endResponse,
    requestHandler,
    serverContext: {},
    fetchAPI: { Response },
  });
  return { promise, endResponse, requestHandler };
}

const hiveConfig = {
  token: 'test-token',
  target: 'my-org/my-project/development',
  appName: 'my-app',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startHiveInit double-invocation guard', () => {
  it('calls fetchDocuments only once when init is already in-flight', async () => {
    let resolveInit!: (docs: HiveDocument[]) => void;
    const fetchDocuments = vi.fn(
      () =>
        new Promise<HiveDocument[]>((r) => {
          resolveInit = r;
        }),
    );
    const loader = createMockLoader({ fetchDocuments });
    mockCreateHiveLoader.mockReturnValue(loader);

    const plugin = useMCP(testCtx, {
      name: 'test',
      tools: [],
      hive: hiveConfig,
    });

    expect(fetchDocuments).toHaveBeenCalledOnce();

    resolveInit([]);
    await vi.waitFor(() => expect(loader.startPolling).toHaveBeenCalledOnce());
    (plugin as any).onDispose();
  });

  it('does not start a second init while one is in-flight and not failed', async () => {
    let resolveInit!: (docs: HiveDocument[]) => void;
    const fetchDocuments = vi.fn(
      () =>
        new Promise<HiveDocument[]>((r) => {
          resolveInit = r;
        }),
    );
    const loader = createMockLoader({ fetchDocuments });
    mockCreateHiveLoader.mockReturnValue(loader);

    const plugin = useMCP(testCtx, {
      name: 'test',
      tools: [],
      hive: hiveConfig,
    });

    expect(fetchDocuments).toHaveBeenCalledOnce();

    const { promise } = callOnRequest(plugin);
    expect(fetchDocuments).toHaveBeenCalledOnce();

    resolveInit([]);
    await promise;
    (plugin as any).onDispose();
  });
});

describe('onRequest hive init retry', () => {
  it('retries hive init when init failed and cooldown has elapsed', async () => {
    let fetchCallCount = 0;
    const fetchDocuments = vi.fn(async (): Promise<HiveDocument[]> => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        throw new Error('Network error');
      }
      return [];
    });

    const loader = createMockLoader({ fetchDocuments });
    mockCreateHiveLoader.mockReturnValue(loader);

    vi.useFakeTimers();

    const plugin = useMCP(testCtx, {
      name: 'test',
      tools: [],
      hive: hiveConfig,
    });

    // Wait for first (failing) init to complete
    await vi.waitFor(() => expect(fetchDocuments).toHaveBeenCalledOnce());

    // Request during cooldown should NOT retry
    const { promise: p1 } = callOnRequest(plugin);
    await p1;
    expect(fetchDocuments).toHaveBeenCalledTimes(1);

    // Advance past 30s cooldown
    await vi.advanceTimersByTimeAsync(31_000);

    // Request after cooldown should retry
    const { promise: p2 } = callOnRequest(plugin);
    await p2;

    expect(fetchDocuments).toHaveBeenCalledTimes(2);

    await vi.waitFor(() => expect(loader.startPolling).toHaveBeenCalledOnce());

    (plugin as any).onDispose();
    vi.useRealTimers();
  });

  it('clears hiveInitPromise after successful init', async () => {
    const fetchDocuments = vi.fn(async (): Promise<HiveDocument[]> => []);
    const loader = createMockLoader({ fetchDocuments });
    mockCreateHiveLoader.mockReturnValue(loader);

    const plugin = useMCP(testCtx, {
      name: 'test',
      tools: [],
      hive: hiveConfig,
    });

    await vi.waitFor(() => expect(loader.startPolling).toHaveBeenCalledOnce());

    const { promise } = callOnRequest(plugin);
    await promise;

    expect(fetchDocuments).toHaveBeenCalledOnce();

    (plugin as any).onDispose();
  });
});

describe('rebuildToolsWithHiveSource error safety', () => {
  it('keeps previous tools when ToolRegistry fails during hive poll update', async () => {
    const validDocs: HiveDocument[] = [
      {
        hash: 'a',
        body: 'query Hello @mcpTool(name: "hello_tool") { hello }',
        operationName: 'Hello',
      },
    ];

    let capturedOnChange!: (docs: HiveDocument[]) => void;
    const loader = createMockLoader({
      fetchDocuments: vi.fn(async () => validDocs),
      startPolling: vi.fn((onChange) => {
        capturedOnChange = onChange;
      }),
    });
    mockCreateHiveLoader.mockReturnValue(loader);

    const plugin = useMCP(testCtx, {
      name: 'test',
      tools: [],
      hive: hiveConfig,
    });

    await vi.waitFor(() => expect(loader.startPolling).toHaveBeenCalledOnce());

    (plugin as any).onSchemaChange({ schema: minimalSchema });

    const { promise } = callOnRequest(plugin);
    await promise;

    const badDocs: HiveDocument[] = [
      {
        hash: 'b',
        body: 'query Bad($x: NonExistentType!) @mcpTool(name: "bad_tool") { hello }',
        operationName: 'Bad',
      },
    ];

    // onChange with bad docs should not crash — keeps previous tools
    capturedOnChange(badDocs);

    const { promise: promise2, endResponse: endResponse2 } =
      callOnRequest(plugin);
    await promise2;
    expect(endResponse2).toHaveBeenCalled();

    (plugin as any).onDispose();
  });
});

describe('rebuildToolsWithHiveSource deferred path', () => {
  it('updates resolvedTools when hive init completes before schema is available', async () => {
    const hiveDocs: HiveDocument[] = [
      {
        hash: 'a',
        body: 'query Hello @mcpTool(name: "hello_tool") { hello }',
        operationName: 'Hello',
      },
    ];

    const loader = createMockLoader({
      fetchDocuments: vi.fn(async () => hiveDocs),
    });
    mockCreateHiveLoader.mockReturnValue(loader);

    const plugin = useMCP(testCtx, {
      name: 'test',
      tools: [],
      hive: hiveConfig,
    });

    await vi.waitFor(() => expect(loader.startPolling).toHaveBeenCalledOnce());

    (plugin as any).onSchemaChange({ schema: minimalSchema });

    const { promise, endResponse } = callOnRequest(plugin);
    await promise;
    expect(endResponse).toHaveBeenCalled();

    (plugin as any).onDispose();
  });
});

describe('onDispose stops polling', () => {
  it('calls stopPolling on the hive loader when disposed', async () => {
    const loader = createMockLoader();
    mockCreateHiveLoader.mockReturnValue(loader);

    const plugin = useMCP(testCtx, {
      name: 'test',
      tools: [],
      hive: hiveConfig,
    });

    await vi.waitFor(() => expect(loader.startPolling).toHaveBeenCalledOnce());

    (plugin as any).onDispose();
    expect(loader.stopPolling).toHaveBeenCalledOnce();
  });

  it('does not start polling if disposed during in-flight init', async () => {
    let resolveInit!: (docs: HiveDocument[]) => void;
    const fetchDocuments = vi.fn(
      () =>
        new Promise<HiveDocument[]>((r) => {
          resolveInit = r;
        }),
    );
    const loader = createMockLoader({ fetchDocuments });
    mockCreateHiveLoader.mockReturnValue(loader);

    const plugin = useMCP(testCtx, {
      name: 'test',
      tools: [],
      hive: hiveConfig,
    });

    expect(fetchDocuments).toHaveBeenCalledOnce();

    (plugin as any).onDispose();
    resolveInit([]);
    await vi.waitFor(() => {});

    expect(loader.startPolling).not.toHaveBeenCalled();
  });
});
