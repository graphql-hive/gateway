import { createLoggerFromLogging } from '@graphql-hive/gateway-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHiveLoader,
  type HiveLoaderConfig,
} from '../src/experimental__hive-loader.js';

const logger = createLoggerFromLogging(false);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function testCtx(fetchFn?: typeof fetch) {
  return { log: logger, fetch: fetchFn ?? globalThis.fetch };
}

function makeConfig(overrides?: Partial<HiveLoaderConfig>): HiveLoaderConfig {
  return {
    token: 'test-token',
    target: 'my-org/my-project/my-target',
    appName: 'my-app',
    endpoint: 'https://app.graphql-hive.com/graphql',
    pollIntervalMs: 60_000,
    ...overrides,
  };
}

// the executor calls response.text() and JSON.parses the result itself
function mockFetch(responses: Array<unknown>) {
  let callIndex = 0;
  return vi.fn(async () => ({
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(responses[callIndex++]),
  })) as unknown as typeof fetch;
}

describe('createHiveLoader', () => {
  describe('load() with explicit appVersion', () => {
    it('fetches a single page of documents', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'abc',
                        body: 'query Foo @mcpTool(name: "foo") { foo }',
                        operationName: 'Foo',
                      },
                    },
                    {
                      node: {
                        hash: 'def',
                        body: 'query Bar { bar }',
                        operationName: 'Bar',
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ]);

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      const source = await loader.load();

      expect(source).toContain('query Foo');
      expect(source).toContain('query Bar');
      expect(fetchFn).toHaveBeenCalledTimes(1);

      const [url, opts] = (fetchFn as any).mock.calls[0]!;
      expect(url).toBe('https://app.graphql-hive.com/graphql');
      expect((opts as RequestInit).headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer test-token' }),
      );

      const body = JSON.parse((fetchFn as any).mock.calls[0]![1]!.body as string);
      expect(body.variables.reference).toEqual({
        bySelector: {
          organizationSlug: 'my-org',
          projectSlug: 'my-project',
          targetSlug: 'my-target',
        },
      });
    });

    it('paginates through multiple pages', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'a', body: 'query A { a }', operationName: 'A' } },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
                },
              },
            },
          },
        },
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'b', body: 'query B { b }', operationName: 'B' } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ]);

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      const source = await loader.load();

      expect(source).toContain('query A');
      expect(source).toContain('query B');
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('throws when deployment is not found', async () => {
      const fetchFn = mockFetch([
        { data: { target: { appDeployment: null } } },
      ]);

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );

      await expect(loader.load()).rejects.toThrow(
        'App deployment "my-app" version "1.0.0" not found',
      );
    });
  });

  describe('load() with latest active (no appVersion)', () => {
    it('resolves latest version then fetches docs', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              activeAppDeployments: {
                edges: [
                  { node: { version: '2.0.0', activatedAt: '2026-03-30T00:00:00Z' } },
                ],
              },
            },
          },
        },
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'x', body: 'query X { x }', operationName: 'X' } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ]);

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      const source = await loader.load();

      expect(source).toContain('query X');
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('paginates docs after resolving latest version', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              activeAppDeployments: {
                edges: [
                  { node: { version: '3.0.0', activatedAt: '2026-03-30T00:00:00Z' } },
                ],
              },
            },
          },
        },
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'p1', body: 'query P1 { p1 }', operationName: 'P1' } },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: 'cursor-page1' },
                },
              },
            },
          },
        },
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'p2', body: 'query P2 { p2 }', operationName: 'P2' } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ]);

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      const source = await loader.load();

      expect(source).toContain('query P1');
      expect(source).toContain('query P2');
      expect(fetchFn).toHaveBeenCalledTimes(3);

      const thirdCall = (fetchFn as any).mock.calls[2]!;
      const thirdBody = JSON.parse(thirdCall[1]!.body as string);
      expect(thirdBody.variables.appVersion).toBe('3.0.0');
      expect(thirdBody.variables.after).toBe('cursor-page1');
    });

    it('throws when no active deployment exists for app name', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              activeAppDeployments: { edges: [] },
            },
          },
        },
      ]);

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      await expect(loader.load()).rejects.toThrow(
        'No active app deployment found for "my-app"',
      );
    });

    it('picks the most recently activated version among multiple active deployments', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              activeAppDeployments: {
                edges: [
                  { node: { version: '1.0.0', activatedAt: '2026-03-28T00:00:00Z' } },
                  { node: { version: '3.0.0', activatedAt: '2026-03-30T00:00:00Z' } },
                  { node: { version: '2.0.0', activatedAt: '2026-03-29T00:00:00Z' } },
                ],
              },
            },
          },
        },
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'v3doc', body: 'query V3 { v3 }', operationName: 'V3' } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ]);

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      await loader.load();

      const docsCall = (fetchFn as any).mock.calls[1]!;
      const docsBody = JSON.parse(docsCall[1]!.body as string);
      expect(docsBody.variables.appVersion).toBe('3.0.0');
    });

    it('throws actionable error when target is not found', async () => {
      const fetchFn = mockFetch([{ data: { target: null } }]);

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      await expect(loader.load()).rejects.toThrow(
        'Target "my-org/my-project/my-target" not found',
      );
    });

    it('throws actionable error when target is not found during doc fetch', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              activeAppDeployments: {
                edges: [
                  { node: { version: '1.0.0', activatedAt: '2026-03-30T00:00:00Z' } },
                ],
              },
            },
          },
        },
        { data: { target: null } },
      ]);

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      await expect(loader.load()).rejects.toThrow(
        'Target "my-org/my-project/my-target" not found',
      );
    });
  });

  describe('error handling', () => {
    it('throws on network error', async () => {
      const fetchFn = vi.fn(async () => {
        throw new Error('Network error');
      }) as unknown as typeof fetch;

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      await expect(loader.load()).rejects.toThrow('Network error');
    });

    it('throws on GraphQL errors', async () => {
      const fetchFn = mockFetch([
        { errors: [{ message: 'Unauthorized' }] },
      ]);

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      await expect(loader.load()).rejects.toThrow('Unauthorized');
    });

    it('throws when response has no data field', async () => {
      const fetchFn = mockFetch([{ data: null }]);

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      await expect(loader.load()).rejects.toThrow();
    });

    it('throws when document is missing hash', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: '', body: 'query A { a }', operationName: 'A' } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ]);

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      await expect(loader.load()).rejects.toThrow('missing hash');
    });

    it('throws when document edge has no node', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [{ node: null }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ]);

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      await expect(loader.load()).rejects.toThrow('missing node');
    });
  });

  describe('mid-pagination deployment disappearance', () => {
    it('returns partial results when deployment vanishes on page 2', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'a', body: 'query A { a }', operationName: 'A' } },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
                },
              },
            },
          },
        },
        { data: { target: { appDeployment: null } } },
      ]);

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      const source = await loader.load();

      expect(source).toContain('query A');
    });
  });

  describe('polling via onUpdate', () => {
    async function advanceTimers(ms: number) {
      if (vi.advanceTimersByTimeAsync) {
        await vi.advanceTimersByTimeAsync(ms);
      } else {
        vi.advanceTimersByTime(ms);
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
    }

    it('calls callback when documents change between polls', async () => {
      let callIndex = 0;
      const responses = [
        // load(): initial fetch
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'a', body: 'query A { a }', operationName: 'A' } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
        // first poll: same docs
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'a', body: 'query A { a }', operationName: 'A' } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
        // second poll: new doc added
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'a', body: 'query A { a }', operationName: 'A' } },
                    { node: { hash: 'b', body: 'query B { b }', operationName: 'B' } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ];

      const fetchFn = vi.fn(async () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(responses[callIndex++]),
      })) as unknown as typeof fetch;

      const loader = createHiveLoader(testCtx(fetchFn), {
        ...makeConfig({ appVersion: '1.0.0' }),
        pollIntervalMs: 1000,
      });

      await loader.load();

      const callback = vi.fn();
      vi.useFakeTimers();
      const stop = loader.onUpdate!(callback) as () => void;

      // first poll: no change
      await advanceTimers(1000);
      expect(callback).not.toHaveBeenCalled();

      // second poll: docs changed
      await advanceTimers(1000);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0]![0]).toContain('query B');

      stop();
    });

    it('does not call callback when documents are unchanged', async () => {
      const sameResponse = {
        data: {
          target: {
            appDeployment: {
              documents: {
                edges: [
                  { node: { hash: 'a', body: 'query A { a }', operationName: 'A' } },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };

      let callIndex = 0;
      const responses = [sameResponse, sameResponse, sameResponse, sameResponse];
      const fetchFn = vi.fn(async () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(responses[callIndex++]),
      })) as unknown as typeof fetch;

      const loader = createHiveLoader(testCtx(fetchFn), {
        ...makeConfig({ appVersion: '1.0.0' }),
        pollIntervalMs: 1000,
      });

      await loader.load();

      const callback = vi.fn();
      vi.useFakeTimers();
      const stop = loader.onUpdate!(callback) as () => void;

      await advanceTimers(3000);
      expect(callback).not.toHaveBeenCalled();

      stop();
    });

    it('does not call callback when same docs arrive in different order', async () => {
      let callIndex = 0;
      const responses = [
        // load()
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'a', body: 'query A { a }', operationName: 'A' } },
                    { node: { hash: 'b', body: 'query B { b }', operationName: 'B' } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
        // first poll: same docs in reversed order
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    { node: { hash: 'b', body: 'query B { b }', operationName: 'B' } },
                    { node: { hash: 'a', body: 'query A { a }', operationName: 'A' } },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ];

      const fetchFn = vi.fn(async () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(responses[callIndex++]),
      })) as unknown as typeof fetch;

      const loader = createHiveLoader(testCtx(fetchFn), {
        ...makeConfig({ appVersion: '1.0.0' }),
        pollIntervalMs: 1000,
      });

      await loader.load();

      const callback = vi.fn();
      vi.useFakeTimers();
      const stop = loader.onUpdate!(callback) as () => void;

      await advanceTimers(1000);
      expect(callback).not.toHaveBeenCalled();

      stop();
    });

    it('stop function clears the interval', async () => {
      let callIndex = 0;
      const emptyResponse = {
        data: {
          target: {
            appDeployment: {
              documents: {
                edges: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };
      const fetchFn = vi.fn(async () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify((callIndex++, emptyResponse)),
      })) as unknown as typeof fetch;

      const loader = createHiveLoader(testCtx(fetchFn), {
        ...makeConfig({ appVersion: '1.0.0' }),
        pollIntervalMs: 1000,
      });

      await loader.load();

      vi.useFakeTimers();
      const stop = loader.onUpdate!(vi.fn()) as () => void;
      await advanceTimers(1000);
      const callsBeforeStop = (fetchFn as any).mock.calls.length;

      stop();
      await advanceTimers(3000);

      expect((fetchFn as any).mock.calls.length).toBe(callsBeforeStop);
    });

    it('logs error on poll failure and continues polling', async () => {
      let callIndex = 0;
      const initialResponse = {
        data: {
          target: {
            appDeployment: {
              documents: {
                edges: [
                  { node: { hash: 'a', body: 'query A { a }', operationName: 'A' } },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };

      const fetchFn = vi.fn(async () => {
        if (callIndex++ === 0) {
          return {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify(initialResponse),
          };
        }
        throw new Error('Network timeout');
      }) as unknown as typeof fetch;

      const mockLogger = {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        child: () => mockLogger,
      } as any;

      const loader = createHiveLoader(
        { log: mockLogger, fetch: fetchFn },
        { ...makeConfig({ appVersion: '1.0.0' }), pollIntervalMs: 1000 },
      );

      await loader.load();

      vi.useFakeTimers();
      const stop = loader.onUpdate!(vi.fn()) as () => void;

      await advanceTimers(1000);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);

      // polling continues after error
      await advanceTimers(1000);
      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(mockLogger.error).toHaveBeenCalledTimes(2);

      stop();
    });
  });
});
