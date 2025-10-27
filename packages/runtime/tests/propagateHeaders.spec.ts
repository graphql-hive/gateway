import {
  createGatewayTester,
  GatewayTesterRemoteSchemaConfig,
} from '@graphql-hive/gateway-testing';
import InMemoryLRUCache from '@graphql-mesh/cache-inmemory-lru';
import useHttpCache from '@graphql-mesh/plugin-http-cache';
import { createSchema, type Plugin } from 'graphql-yoga';
import { describe, expect, it, vi } from 'vitest';

describe('usePropagateHeaders', () => {
  describe('From Client to the Subgraphs', () => {
    function prepare() {
      const requestTrackerPlugin = {
        onParams: vi.fn((() => {}) as Plugin['onParams']),
      };
      return {
        requestTrackerPlugin,
        name: 'upstream',
        schema: createSchema({
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'world',
            },
          },
        }),
        yoga: {
          plugins: [requestTrackerPlugin],
        },
      };
    }

    it('forwards specified headers', async () => {
      const { requestTrackerPlugin, ...config } = prepare();
      await using gateway = createGatewayTester({
        proxy: config,
        propagateHeaders: {
          fromClientToSubgraphs({ request }) {
            return {
              'x-my-header': request.headers.get('x-my-header')!,
              'x-my-other': request.headers.get('x-my-other')!,
            };
          },
        },
      });
      const response = await gateway.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'x-my-header': 'my-value',
          'x-my-other': 'other-value',
          'x-extra-header': 'extra-value',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: /* GraphQL */ `
            query {
              hello
            }
          `,
          extensions: {
            randomThing: 'randomValue',
          },
        }),
      });

      const resJson = await response.json();
      expect(resJson).toEqual({
        data: {
          hello: 'world',
        },
      });

      // The first call is for the introspection
      expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(2);
      const onParamsPayload = requestTrackerPlugin.onParams.mock.calls[1]?.[0]!;
      // Do not pass extensions
      expect(onParamsPayload.params.extensions).toBeUndefined();
      const headersObj = Object.fromEntries(
        onParamsPayload.request.headers.entries(),
      );
      expect(headersObj['x-my-header']).toBe('my-value');
      expect(headersObj['x-my-other']).toBe('other-value');
      expect(headersObj['x-extra-header']).toBeUndefined();
    });
    it("won't forward empty headers", async () => {
      const { requestTrackerPlugin, ...config } = prepare();
      await using gateway = createGatewayTester({
        proxy: config,
        propagateHeaders: {
          fromClientToSubgraphs({ request }) {
            return {
              'x-empty-header': request.headers.get('x-empty-header')!,
            };
          },
        },
      });

      await expect(
        gateway.execute({
          query: /* GraphQL */ `
            query {
              hello
            }
          `,
          extensions: {
            randomThing: 'randomValue',
          },
        }),
      ).resolves.toEqual({
        data: {
          hello: 'world',
        },
      });

      // The first call is for the introspection
      expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(2);
      const onParamsPayload = requestTrackerPlugin.onParams.mock.calls[1]?.[0]!;
      // Do not pass extensions
      expect(onParamsPayload.params.extensions).toBeUndefined();
      const headersObj = Object.fromEntries(
        onParamsPayload.request.headers.entries(),
      );
      expect(headersObj['x-empty-header']).toBeUndefined();
    });
  });

  describe('From Subgraphs to the Client', () => {
    const subgraphs: GatewayTesterRemoteSchemaConfig[] = [
      {
        name: 'upstream1',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              hello1: String
            }
          `,
          resolvers: {
            Query: {
              hello1: () => 'world1',
            },
          },
        },
        yoga: {
          plugins: [
            {
              onResponse: ({ response }) => {
                response.headers.set('cache-control', 'max-age=60, private');
                response.headers.set('upstream1', 'upstream1');
                response.headers.append('set-cookie', 'cookie1=value1');
                response.headers.append('set-cookie', 'cookie2=value2');
              },
            } as Plugin,
          ],
        },
      },
      {
        name: 'upstream2',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              hello2: String
            }
          `,
          resolvers: {
            Query: {
              hello2: () => 'world2',
            },
          },
        },
        yoga: {
          plugins: [
            {
              onResponse: ({ response }) => {
                response.headers.set('upstream2', 'upstream2');
                response.headers.append('set-cookie', 'cookie3=value3');
                response.headers.append('set-cookie', 'cookie4=value4');
              },
            } as Plugin,
          ],
        },
      },
    ];

    it('Aggregates cookies from all subgraphs', async () => {
      await using gateway = createGatewayTester({
        subgraphs,
        propagateHeaders: {
          fromSubgraphsToClient({ response }) {
            const cookies = response.headers.getSetCookie();
            const returns: Record<string, string | string[]> = {
              'set-cookie': cookies,
            };

            const up1 = response.headers.get('upstream1');
            if (up1) {
              returns['upstream1'] = up1;
            }

            const up2 = response.headers.get('upstream2');
            if (up2) {
              returns['upstream2'] = up2;
            }

            return returns;
          },
        },
      });

      const response = await gateway.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: /* GraphQL */ `
            query {
              hello1
              hello2
            }
          `,
        }),
      });

      await expect(response.json()).resolves.toEqual({
        data: {
          hello1: 'world1',
          hello2: 'world2',
        },
      });

      expect(response.headers.get('upstream1')).toBe('upstream1');
      expect(response.headers.get('upstream2')).toBe('upstream2');
      expect(response.headers.get('set-cookie')).toBe(
        'cookie1=value1, cookie2=value2, cookie3=value3, cookie4=value4',
      );
    });
    it('should propagate headers when caching upstream', async () => {
      await using cache = new InMemoryLRUCache();

      await using gateway = createGatewayTester({
        subgraphs,
        cache,
        propagateHeaders: {
          fromSubgraphsToClient({ response }) {
            const cookies = response.headers.getSetCookie();

            const returns: Record<string, string | string[]> = {
              'set-cookie': cookies,
            };

            const up1 = response.headers.get('upstream1');
            if (up1) {
              returns['upstream1'] = up1;
            }

            const up2 = response.headers.get('upstream2');
            if (up2) {
              returns['upstream2'] = up2;
            }

            return returns;
          },
        },
        plugins: (context) => [useHttpCache(context)],
      });

      for (let i = 0; i < 3; i++) {
        const res = await gateway.fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: /* GraphQL */ `
              query {
                hello1
                hello2
              }
            `,
          }),
        });

        await expect(res.json()).resolves.toEqual({
          data: {
            hello1: 'world1',
            hello2: 'world2',
          },
        });

        expect(res.headers.get('upstream1')).toBe('upstream1');
        expect(res.headers.get('upstream2')).toBe('upstream2');
        expect(res.headers.get('set-cookie')).toBe(
          'cookie1=value1, cookie2=value2, cookie3=value3, cookie4=value4',
        );
      }
    });
    it('should deduplicate non-cookie headers from multiple subgraphs when deduplicateHeaders is true', async () => {
      await using gateway = createGatewayTester({
        subgraphs: [
          {
            name: 'upstream1',
            schema: {
              typeDefs: /* GraphQL */ `
                type Query {
                  hello1: String
                }
              `,
              resolvers: {
                Query: {
                  hello1: () => 'world1',
                },
              },
            },
            yoga: {
              plugins: [
                {
                  onResponse: ({ response }) => {
                    response.headers.set(
                      'x-shared-header',
                      'value-from-upstream1',
                    );
                    response.headers.append('set-cookie', 'cookie1=value1');
                  },
                },
              ],
            },
          },
          {
            name: 'upstream2',
            schema: {
              typeDefs: /* GraphQL */ `
                type Query {
                  hello2: String
                }
              `,
              resolvers: {
                Query: {
                  hello2: () => 'world2',
                },
              },
            },
            yoga: {
              plugins: [
                {
                  onResponse: ({ response }) => {
                    response.headers.set(
                      'x-shared-header',
                      'value-from-upstream2',
                    );
                    response.headers.append('set-cookie', 'cookie2=value2');
                  },
                },
              ],
            },
          },
        ],
        propagateHeaders: {
          deduplicateHeaders: true,
          fromSubgraphsToClient({ response }) {
            const cookies = response.headers.getSetCookie();
            const sharedHeader = response.headers.get('x-shared-header');

            const returns: Record<string, string | string[]> = {
              'set-cookie': cookies,
            };

            if (sharedHeader) {
              returns['x-shared-header'] = sharedHeader;
            }

            return returns;
          },
        },
      });
      const response = await gateway.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: /* GraphQL */ `
            query {
              hello1
              hello2
            }
          `,
        }),
      });

      const resJson = await response.json();
      expect(resJson).toEqual({
        data: {
          hello1: 'world1',
          hello2: 'world2',
        },
      });

      // Non-cookie headers should be deduplicated (only the last value is kept)
      expect(response.headers.get('x-shared-header')).toBe(
        'value-from-upstream2',
      );

      // set-cookie headers should still be aggregated (not deduplicated)
      expect(response.headers.get('set-cookie')).toBe(
        'cookie1=value1, cookie2=value2',
      );
    });
    it('should append all non-cookie headers from multiple subgraphs when deduplicateHeaders is false', async () => {
      await using gateway = createGatewayTester({
        subgraphs: [
          {
            name: 'upstream1',
            schema: {
              typeDefs: /* GraphQL */ `
                type Query {
                  hello1: String
                }
              `,
              resolvers: {
                Query: {
                  hello1: () => 'world1',
                },
              },
            },
            yoga: {
              plugins: [
                {
                  onResponse: ({ response }) => {
                    response.headers.set(
                      'x-shared-header',
                      'value-from-upstream1',
                    );
                    response.headers.append('set-cookie', 'cookie1=value1');
                  },
                },
              ],
            },
          },
          {
            name: 'upstream2',
            schema: {
              typeDefs: /* GraphQL */ `
                type Query {
                  hello2: String
                }
              `,
              resolvers: {
                Query: {
                  hello2: () => 'world2',
                },
              },
            },
            yoga: {
              plugins: [
                {
                  onResponse: ({ response }) => {
                    response.headers.set(
                      'x-shared-header',
                      'value-from-upstream2',
                    );
                    response.headers.append('set-cookie', 'cookie2=value2');
                  },
                },
              ],
            },
          },
        ],
        propagateHeaders: {
          deduplicateHeaders: false,
          fromSubgraphsToClient({ response }) {
            const cookies = response.headers.getSetCookie();
            const sharedHeader = response.headers.get('x-shared-header');

            const returns: Record<string, string | string[]> = {
              'set-cookie': cookies,
            };

            if (sharedHeader) {
              returns['x-shared-header'] = sharedHeader;
            }

            return returns;
          },
        },
      });
      const response = await gateway.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: /* GraphQL */ `
            query {
              hello1
              hello2
            }
          `,
        }),
      });

      const resJson = await response.json();
      expect(resJson).toEqual({
        data: {
          hello1: 'world1',
          hello2: 'world2',
        },
      });

      // Non-cookie headers should NOT be deduplicated (all values are appended)
      expect(response.headers.get('x-shared-header')).toBe(
        'value-from-upstream1, value-from-upstream2',
      );

      // set-cookie headers should be aggregated as usual
      expect(response.headers.get('set-cookie')).toBe(
        'cookie1=value1, cookie2=value2',
      );
    });
  });
});
