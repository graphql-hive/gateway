import { createLoggerFromLogging } from '@graphql-hive/gateway-runtime';
import { buildSchema } from 'graphql';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMCP } from '../src/plugin.js';

const minimalSchema = buildSchema(`
  type Query {
    hello: String
  }
`);

function createMockFetch(
  responses: Array<
    | { resolve: unknown }
    | { reject: Error }
    | { pending: (resolve: (v: unknown) => void) => void }
  >,
) {
  let callIndex = 0;
  const fn = vi.fn(async () => {
    const entry = responses[callIndex++ % responses.length]!;
    if ('reject' in entry) throw entry.reject;
    const data =
      'pending' in entry ? await new Promise(entry.pending) : entry.resolve;
    return { ok: true, json: async () => data };
  }) as unknown as typeof fetch;
  return fn;
}

function docsResponse(
  docs: Array<{ hash: string; body: string; operationName: string }>,
) {
  return {
    resolve: {
      data: {
        target: {
          appDeployment: {
            documents: {
              edges: docs.map((d) => ({ node: d })),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    },
  };
}

const emptyDocs = docsResponse([]);

function callOnRequestParse(plugin: ReturnType<typeof useMCP>, path = '/mcp') {
  const endResponse = vi.fn();
  const setRequestParser = vi.fn();
  const promise = (plugin as any).onRequestParse({
    request: new Request(`http://localhost${path}`, {
      method: 'POST',
      body: '{}',
    }),
    url: new URL(`http://localhost${path}`),
    endResponse,
    setRequestParser,
    serverContext: {},
    fetchAPI: { Response, Request },
  });
  return { promise, endResponse, setRequestParser };
}

async function waitFor(fn: () => void, { timeout = 1000, interval = 10 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      fn();
      return;
    } catch (e) {
      if (Date.now() - start > timeout) throw e;
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

const hiveConfig = {
  token: 'test-token',
  target: 'my-org/my-project/development',
  appName: 'my-app',
  appVersion: '1.0.0',
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startHiveInit double-invocation guard', () => {
  it('calls fetchDocuments only once when init is already in-flight', async () => {
    let resolveInit!: (v: unknown) => void;
    const fetchFn = createMockFetch([
      {
        pending: (r) => {
          resolveInit = r;
        },
      },
    ]);

    const plugin = useMCP(
      { log: createLoggerFromLogging(false), fetch: fetchFn },
      { name: 'test', tools: [], hive: hiveConfig },
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);

    resolveInit(emptyDocs.resolve);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    (plugin as any).onDispose();
  });

  it('does not start a second init while one is in-flight and not failed', async () => {
    let resolveInit!: (v: unknown) => void;
    const fetchFn = createMockFetch([
      {
        pending: (r) => {
          resolveInit = r;
        },
      },
    ]);

    const plugin = useMCP(
      { log: createLoggerFromLogging(false), fetch: fetchFn },
      { name: 'test', tools: [], hive: hiveConfig },
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);

    const { promise } = callOnRequestParse(plugin);
    // onRequestParse should NOT trigger a second init
    expect(fetchFn).toHaveBeenCalledTimes(1);

    resolveInit(emptyDocs.resolve);
    await promise;
    (plugin as any).onDispose();
  });
});

describe('onRequestParse hive init retry', () => {
  it('retries hive init when init failed and cooldown has elapsed', async () => {
    const fetchFn = createMockFetch([
      { reject: new Error('Network error') },
      emptyDocs,
    ]);

    vi.useFakeTimers();

    const plugin = useMCP(
      { log: createLoggerFromLogging(false), fetch: fetchFn },
      { name: 'test', tools: [], hive: hiveConfig },
    );

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    // Request during cooldown should NOT retry
    const { promise: p1 } = callOnRequestParse(plugin);
    await p1;
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Advance past 30s cooldown
    vi.advanceTimersByTime(31_000);
    await Promise.resolve();

    // Request after cooldown should retry
    const { promise: p2 } = callOnRequestParse(plugin);
    await p2;

    expect(fetchFn).toHaveBeenCalledTimes(2);

    (plugin as any).onDispose();
  });

  it('clears hiveInitPromise after successful init', async () => {
    const fetchFn = createMockFetch([emptyDocs]);

    const plugin = useMCP(
      { log: createLoggerFromLogging(false), fetch: fetchFn },
      { name: 'test', tools: [], hive: hiveConfig },
    );

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    const { promise } = callOnRequestParse(plugin);
    await promise;

    // No additional fetch — init already completed
    expect(fetchFn).toHaveBeenCalledTimes(1);

    (plugin as any).onDispose();
  });
});

describe('rebuildToolsWithHiveSource error safety', () => {
  it('keeps previous tools when ToolRegistry fails during hive poll update', async () => {
    const validDoc = {
      hash: 'a',
      body: 'query Hello @mcpTool(name: "hello_tool") { hello }',
      operationName: 'Hello',
    };
    const badDoc = {
      hash: 'b',
      body: 'query Bad($x: NonExistentType!) @mcpTool(name: "bad_tool") { hello }',
      operationName: 'Bad',
    };

    const fetchFn = createMockFetch([
      docsResponse([validDoc]),
      docsResponse([badDoc]),
    ]);

    const plugin = useMCP(
      { log: createLoggerFromLogging(false), fetch: fetchFn },
      {
        name: 'test',
        tools: [],
        hive: { ...hiveConfig, pollIntervalMs: 1000 },
      },
    );

    // Wait for init fetch
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    (plugin as any).onSchemaChange({ schema: minimalSchema });

    // First request should work with valid tools
    const { promise } = callOnRequestParse(plugin);
    await promise;

    // Trigger a poll with bad docs — should not crash
    vi.useFakeTimers();
    vi.advanceTimersByTime(1100);
    await Promise.resolve();
    await Promise.resolve();

    const { promise: promise2, endResponse: endResponse2 } =
      callOnRequestParse(plugin);
    await promise2;
    expect(endResponse2).toHaveBeenCalled();

    (plugin as any).onDispose();
  });
});

describe('rebuildToolsWithHiveSource deferred path', () => {
  it('updates resolvedTools when hive init completes before schema is available', async () => {
    const hiveDocs = [
      {
        hash: 'a',
        body: 'query Hello @mcpTool(name: "hello_tool") { hello }',
        operationName: 'Hello',
      },
    ];
    const fetchFn = createMockFetch([docsResponse(hiveDocs)]);

    const plugin = useMCP(
      { log: createLoggerFromLogging(false), fetch: fetchFn },
      { name: 'test', tools: [], hive: hiveConfig },
    );

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    (plugin as any).onSchemaChange({ schema: minimalSchema });

    const { promise, endResponse } = callOnRequestParse(plugin);
    await promise;
    expect(endResponse).toHaveBeenCalled();

    (plugin as any).onDispose();
  });
});

describe('onDispose stops polling', () => {
  it('calls stopPolling on the hive loader when disposed', async () => {
    const fetchFn = createMockFetch([emptyDocs, emptyDocs]);

    vi.useFakeTimers();

    const plugin = useMCP(
      { log: createLoggerFromLogging(false), fetch: fetchFn },
      {
        name: 'test',
        tools: [],
        hive: { ...hiveConfig, pollIntervalMs: 1000 },
      },
    );

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    (plugin as any).onDispose();
    const callsAfterDispose = (fetchFn as any).mock.calls.length;

    // Advance time — no more fetches should happen
    vi.advanceTimersByTime(5000);
    expect((fetchFn as any).mock.calls.length).toBe(callsAfterDispose);
  });

  it('does not start polling if disposed during in-flight init', async () => {
    let resolveInit!: (v: unknown) => void;
    const fetchFn = createMockFetch([
      {
        pending: (r) => {
          resolveInit = r;
        },
      },
    ]);

    vi.useFakeTimers();

    const plugin = useMCP(
      { log: createLoggerFromLogging(false), fetch: fetchFn },
      {
        name: 'test',
        tools: [],
        hive: { ...hiveConfig, pollIntervalMs: 1000 },
      },
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);

    (plugin as any).onDispose();
    resolveInit(emptyDocs.resolve);
    await Promise.resolve();
    await Promise.resolve();

    // No polling should have started
    vi.advanceTimersByTime(5000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
