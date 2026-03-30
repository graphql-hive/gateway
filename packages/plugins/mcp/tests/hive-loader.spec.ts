import { createLoggerFromLogging } from '@graphql-hive/gateway-runtime';
import { describe, expect, it, vi } from 'vitest';
import { createHiveLoader, type HiveLoaderConfig } from '../src/hive-loader.js';

const logger = createLoggerFromLogging(false);

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

function mockFetch(
  responses: Array<{ data: unknown } | { errors: unknown[] }>,
) {
  let callIndex = 0;
  return vi.fn(async () => ({
    ok: true,
    json: async () => responses[callIndex++],
  })) as unknown as typeof fetch;
}

describe('createHiveLoader', () => {
  describe('fetchDocuments with explicit appVersion', () => {
    it('fetches a single page of documents', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              appDeployment: {
                id: 'dep-1',
                name: 'my-app',
                version: '1.0.0',
                status: 'active',
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
      const docs = await loader.fetchDocuments();

      expect(docs).toHaveLength(2);
      expect(docs[0]).toEqual({
        hash: 'abc',
        body: 'query Foo @mcpTool(name: "foo") { foo }',
        operationName: 'Foo',
      });
      expect(docs[1]).toEqual({
        hash: 'def',
        body: 'query Bar { bar }',
        operationName: 'Bar',
      });

      expect(fetchFn).toHaveBeenCalledOnce();
      const [url, opts] = vi.mocked(fetchFn).mock.calls[0]!;
      expect(url).toBe('https://app.graphql-hive.com/graphql');
      expect((opts as RequestInit).headers).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      );

      const body = JSON.parse(
        vi.mocked(fetchFn).mock.calls[0]![1]!.body as string,
      );
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
                id: 'dep-1',
                name: 'my-app',
                version: '1.0.0',
                status: 'active',
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'a',
                        body: 'query A { a }',
                        operationName: 'A',
                      },
                    },
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
                id: 'dep-1',
                name: 'my-app',
                version: '1.0.0',
                status: 'active',
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'b',
                        body: 'query B { b }',
                        operationName: 'B',
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
      const docs = await loader.fetchDocuments();

      expect(docs).toHaveLength(2);
      expect(docs[0]!.hash).toBe('a');
      expect(docs[1]!.hash).toBe('b');
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

      await expect(loader.fetchDocuments()).rejects.toThrow(
        'App deployment "my-app" version "1.0.0" not found',
      );
    });
  });

  describe('fetchDocuments with latest active (no appVersion)', () => {
    it('resolves latest version then fetches docs', async () => {
      const fetchFn = mockFetch([
        // First call: resolve latest version
        {
          data: {
            target: {
              activeAppDeployments: {
                edges: [
                  {
                    node: {
                      version: '2.0.0',
                      activatedAt: '2026-03-30T00:00:00Z',
                    },
                  },
                ],
              },
            },
          },
        },
        // Second call: fetch docs by version
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'x',
                        body: 'query X { x }',
                        operationName: 'X',
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

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      const docs = await loader.fetchDocuments();

      expect(docs).toHaveLength(1);
      expect(docs[0]!.hash).toBe('x');
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('paginates docs after resolving latest version', async () => {
      const fetchFn = mockFetch([
        // First call: resolve latest version
        {
          data: {
            target: {
              activeAppDeployments: {
                edges: [
                  {
                    node: {
                      version: '3.0.0',
                      activatedAt: '2026-03-30T00:00:00Z',
                    },
                  },
                ],
              },
            },
          },
        },
        // Second call: docs page 1
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'p1',
                        body: 'query P1 { p1 }',
                        operationName: 'P1',
                      },
                    },
                  ],
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: 'cursor-page1',
                  },
                },
              },
            },
          },
        },
        // Third call: docs page 2
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'p2',
                        body: 'query P2 { p2 }',
                        operationName: 'P2',
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

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      const docs = await loader.fetchDocuments();

      expect(docs).toHaveLength(2);
      expect(docs[0]!.hash).toBe('p1');
      expect(docs[1]!.hash).toBe('p2');
      expect(fetchFn).toHaveBeenCalledTimes(3);

      // Verify the third call uses correct cursor
      const thirdCall = vi.mocked(fetchFn).mock.calls[2]!;
      const thirdBody = JSON.parse(thirdCall[1]!.body as string);
      expect(thirdBody.variables.appVersion).toBe('3.0.0');
      expect(thirdBody.variables.after).toBe('cursor-page1');
    });

    it('throws when no active deployment exists for app name', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              activeAppDeployments: {
                edges: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      ]);

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      await expect(loader.fetchDocuments()).rejects.toThrow(
        'No active app deployment found for "my-app"',
      );
    });

    it('picks the most recently activated version among multiple active deployments', async () => {
      const fetchFn = mockFetch([
        // First call: resolve version. multiple active, not ordered by activatedAt
        {
          data: {
            target: {
              activeAppDeployments: {
                edges: [
                  {
                    node: {
                      version: '1.0.0',
                      activatedAt: '2026-03-28T00:00:00Z',
                    },
                  },
                  {
                    node: {
                      version: '3.0.0',
                      activatedAt: '2026-03-30T00:00:00Z',
                    },
                  },
                  {
                    node: {
                      version: '2.0.0',
                      activatedAt: '2026-03-29T00:00:00Z',
                    },
                  },
                ],
              },
            },
          },
        },
        // Second call: fetch docs for v3.0.0 (the latest activated)
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'v3doc',
                        body: 'query V3 { v3 }',
                        operationName: 'V3',
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

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      const docs = await loader.fetchDocuments();

      expect(docs).toHaveLength(1);
      expect(docs[0]!.hash).toBe('v3doc');

      // Verify the docs query used version 3.0.0
      const docsCall = vi.mocked(fetchFn).mock.calls[1]!;
      const docsBody = JSON.parse(docsCall[1]!.body as string);
      expect(docsBody.variables.appVersion).toBe('3.0.0');
    });

    it('handles NaN activatedAt by falling back to first edge', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              activeAppDeployments: {
                edges: [
                  { node: { version: '1.0.0', activatedAt: 'invalid-date' } },
                  { node: { version: '2.0.0', activatedAt: 'also-invalid' } },
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
                    {
                      node: {
                        hash: 'h1',
                        body: 'query A { a }',
                        operationName: 'A',
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

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      const docs = await loader.fetchDocuments();

      // Should not throw, falls back to first edge
      expect(docs).toHaveLength(1);
      const docsCall = vi.mocked(fetchFn).mock.calls[1]!;
      const docsBody = JSON.parse(docsCall[1]!.body as string);
      expect(docsBody.variables.appVersion).toBe('1.0.0');
    });

    it('throws actionable error when target is not found', async () => {
      const fetchFn = mockFetch([{ data: { target: null } }]);

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      await expect(loader.fetchDocuments()).rejects.toThrow(
        'Target "my-org/my-project/my-target" not found',
      );
    });

    it('throws actionable error when target is not found during doc fetch', async () => {
      const fetchFn = mockFetch([
        // Version resolution succeeds
        {
          data: {
            target: {
              activeAppDeployments: {
                edges: [
                  {
                    node: {
                      version: '1.0.0',
                      activatedAt: '2026-03-30T00:00:00Z',
                    },
                  },
                ],
              },
            },
          },
        },
        // Doc fetch returns null target
        { data: { target: null } },
      ]);

      const loader = createHiveLoader(testCtx(fetchFn), makeConfig());
      await expect(loader.fetchDocuments()).rejects.toThrow(
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
      await expect(loader.fetchDocuments()).rejects.toThrow('Network error');
    });

    it('throws on GraphQL errors', async () => {
      const fetchFn = mockFetch([
        { errors: [{ message: 'Unauthorized' }] } as any,
      ]);

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      await expect(loader.fetchDocuments()).rejects.toThrow('Unauthorized');
    });

    it('throws on non-ok HTTP response with body detail', async () => {
      const fetchFn = vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Token expired',
      })) as unknown as typeof fetch;

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      await expect(loader.fetchDocuments()).rejects.toThrow(
        'Hive API request failed: 401 Unauthorized — Token expired',
      );
    });

    it('throws on invalid JSON response', async () => {
      const fetchFn = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      })) as unknown as typeof fetch;

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      await expect(loader.fetchDocuments()).rejects.toThrow(
        'Hive API returned invalid JSON',
      );
    });

    it('throws when response has no data field', async () => {
      const fetchFn = mockFetch([{ data: null } as any]);

      const loader = createHiveLoader(
        testCtx(fetchFn),
        makeConfig({ appVersion: '1.0.0' }),
      );
      await expect(loader.fetchDocuments()).rejects.toThrow(
        'Hive API returned no data',
      );
    });

    it('throws when document is missing hash', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              appDeployment: {
                id: '1',
                name: 'my-app',
                version: '1.0.0',
                status: 'active',
                documents: {
                  edges: [
                    {
                      node: {
                        hash: '',
                        body: 'query A { a }',
                        operationName: 'A',
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
      await expect(loader.fetchDocuments()).rejects.toThrow('missing hash');
    });

    it('throws when document edge has no node', async () => {
      const fetchFn = mockFetch([
        {
          data: {
            target: {
              appDeployment: {
                id: '1',
                name: 'my-app',
                version: '1.0.0',
                status: 'active',
                documents: {
                  edges: [{ node: null } as any],
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
      await expect(loader.fetchDocuments()).rejects.toThrow('missing node');
    });
  });

  describe('config validation', () => {
    it('throws on empty token', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ token: '' })),
      ).toThrow('non-empty token');
    });

    it('throws on whitespace-only token', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ token: '  ' })),
      ).toThrow('non-empty token');
    });

    it('throws on empty target', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ target: '' })),
      ).toThrow('target');
    });

    it('throws on target with wrong number of segments', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ target: 'org/project' })),
      ).toThrow('org/project/target');
    });

    it('throws on target with empty segments', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ target: 'org//target' })),
      ).toThrow('org/project/target');
    });

    it('throws on empty appName', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ appName: '' })),
      ).toThrow('non-empty appName');
    });

    it('throws on empty endpoint', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ endpoint: '' })),
      ).toThrow('non-empty endpoint');
    });

    it('throws on invalid URL endpoint', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ endpoint: 'not-a-url' })),
      ).toThrow('not a valid URL');
    });

    it('throws when pollIntervalMs is below 1000', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ pollIntervalMs: 500 })),
      ).toThrow('at least 1000ms');
    });

    it('throws when pollIntervalMs is NaN', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ pollIntervalMs: NaN })),
      ).toThrow('at least 1000ms');
    });

    it('throws when pollIntervalMs is Infinity', () => {
      expect(() =>
        createHiveLoader(testCtx(), makeConfig({ pollIntervalMs: Infinity })),
      ).toThrow('at least 1000ms');
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
                    {
                      node: {
                        hash: 'a',
                        body: 'query A { a }',
                        operationName: 'A',
                      },
                    },
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
      const docs = await loader.fetchDocuments();

      expect(docs).toHaveLength(1);
      expect(docs[0]!.hash).toBe('a');
    });
  });

  describe('polling', () => {
    const initialDocs = [
      { hash: 'a', body: 'query A { a }', operationName: 'A' as string | null },
    ];

    it('calls onChange when documents change between polls', async () => {
      let callIndex = 0;
      const responses = [
        // First poll: same docs
        {
          data: {
            target: {
              appDeployment: {
                id: '1',
                name: 'my-app',
                version: '1.0.0',
                status: 'active',
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'a',
                        body: 'query A { a }',
                        operationName: 'A',
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
        // Second poll: different docs
        {
          data: {
            target: {
              appDeployment: {
                id: '1',
                name: 'my-app',
                version: '1.0.0',
                status: 'active',
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'a',
                        body: 'query A { a }',
                        operationName: 'A',
                      },
                    },
                    {
                      node: {
                        hash: 'b',
                        body: 'query B { b }',
                        operationName: 'B',
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ];

      const fetchFn = vi.fn(async () => ({
        ok: true,
        json: async () => responses[callIndex++],
      })) as unknown as typeof fetch;

      const loader = createHiveLoader(testCtx(fetchFn), {
        ...makeConfig({ appVersion: '1.0.0' }),
        pollIntervalMs: 1000,
      });
      const onChange = vi.fn();

      vi.useFakeTimers();
      loader.startPolling(onChange, initialDocs);

      // First poll — no change
      await vi.advanceTimersByTimeAsync(1000);
      expect(onChange).not.toHaveBeenCalled();

      // Second poll — docs changed
      await vi.advanceTimersByTimeAsync(1000);
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange.mock.calls[0]![0]).toHaveLength(2);

      loader.stopPolling();
      vi.useRealTimers();
    });

    it('does not call onChange when documents are unchanged', async () => {
      const sameResponse = {
        data: {
          target: {
            appDeployment: {
              id: '1',
              name: 'my-app',
              version: '1.0.0',
              status: 'active',
              documents: {
                edges: [
                  {
                    node: {
                      hash: 'a',
                      body: 'query A { a }',
                      operationName: 'A',
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };

      const fetchFn = vi.fn(async () => ({
        ok: true,
        json: async () => sameResponse,
      })) as unknown as typeof fetch;

      const loader = createHiveLoader(testCtx(fetchFn), {
        ...makeConfig({ appVersion: '1.0.0' }),
        pollIntervalMs: 1000,
      });
      const onChange = vi.fn();

      vi.useFakeTimers();
      loader.startPolling(onChange, initialDocs);
      await vi.advanceTimersByTimeAsync(3000); // 3 poll intervals

      expect(onChange).not.toHaveBeenCalled();

      loader.stopPolling();
      vi.useRealTimers();
    });

    it('stopPolling clears the interval', async () => {
      const fetchFn = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            target: {
              appDeployment: {
                id: '1',
                name: 'my-app',
                version: '1.0.0',
                status: 'active',
                documents: {
                  edges: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        }),
      })) as unknown as typeof fetch;

      const loader = createHiveLoader(testCtx(fetchFn), {
        ...makeConfig({ appVersion: '1.0.0' }),
        pollIntervalMs: 1000,
      });

      vi.useFakeTimers();
      loader.startPolling(vi.fn(), []);
      await vi.advanceTimersByTimeAsync(1000);
      const callsBeforeStop = vi.mocked(fetchFn).mock.calls.length;

      loader.stopPolling();
      await vi.advanceTimersByTimeAsync(3000);

      // No new calls after stopping
      expect(vi.mocked(fetchFn).mock.calls.length).toBe(callsBeforeStop);
      vi.useRealTimers();
    });

    it('logs error on poll failure and continues polling', async () => {
      const fetchFn = vi.fn(async () => {
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
      const onChange = vi.fn();

      vi.useFakeTimers();
      loader.startPolling(onChange, initialDocs);
      await vi.advanceTimersByTimeAsync(1000);

      expect(onChange).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledOnce();

      // Polling continues after error — second tick fires another attempt
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(mockLogger.error).toHaveBeenCalledTimes(2);

      loader.stopPolling();
      vi.useRealTimers();
    });

    it('retries onChange on next poll when onChange throws', async () => {
      let callIndex = 0;
      const responses = [
        // First poll: new doc added (triggers onChange)
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'abc123',
                        body: initialDocs[0]!.body,
                        operationName: 'A',
                      },
                    },
                    {
                      node: {
                        hash: 'newDoc',
                        body: 'query New { new }',
                        operationName: 'New',
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
        // Second poll: same docs (should retry onChange since first failed)
        {
          data: {
            target: {
              appDeployment: {
                documents: {
                  edges: [
                    {
                      node: {
                        hash: 'abc123',
                        body: initialDocs[0]!.body,
                        operationName: 'A',
                      },
                    },
                    {
                      node: {
                        hash: 'newDoc',
                        body: 'query New { new }',
                        operationName: 'New',
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
      ];

      const fetchFn = vi.fn(async () => ({
        ok: true,
        json: async () => responses[callIndex++],
      })) as unknown as typeof fetch;

      let onChangeCallCount = 0;
      const onChange = vi.fn(() => {
        onChangeCallCount++;
        if (onChangeCallCount === 1) {
          throw new Error('Rebuild failed');
        }
      });

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

      vi.useFakeTimers();
      loader.startPolling(onChange, initialDocs);

      // First poll: onChange throws
      await vi.advanceTimersByTimeAsync(1000);
      expect(onChange).toHaveBeenCalledOnce();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('onChange handler failed'),
      );

      // Second poll: same docs, onChange retried and succeeds
      await vi.advanceTimersByTimeAsync(1000);
      expect(onChange).toHaveBeenCalledTimes(2);

      loader.stopPolling();
      vi.useRealTimers();
    });
  });
});
