import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import restTransport from '@graphql-mesh/transport-rest';
import { KeyValueCache, Logger } from '@graphql-mesh/types';
import {
  createDeferred,
  fakePromise,
  printSchemaWithDirectives,
} from '@graphql-tools/utils';
import { fakeRejectPromise, isDebug } from '@internal/testing';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { createRouter, Response, Type } from 'fets';
import {
  buildSchema,
  GraphQLSchema,
  introspectionFromSchema,
  printSchema,
} from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it, vi } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';
import { useCustomFetch } from '../src/plugins/useCustomFetch';
import type { GatewayPlugin } from '../src/types';

describe('Gateway Runtime', () => {
  let upstreamIsDownForNextRequest = false;

  function createSupergraphRuntime() {
    return createGatewayRuntime({
      logging: isDebug(),
      supergraph: () => {
        if (upstreamIsDownForNextRequest) {
          upstreamIsDownForNextRequest = false;
          throw new Error('Upstream is down');
        }
        return getUnifiedGraphGracefully([
          {
            name: 'upstream',
            schema: createUpstreamSchema(),
            url: 'http://localhost:4000/graphql',
          },
        ]);
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
          upstreamFetch,
        ),
      ],
    });
  }
  function createUpstreamSchema() {
    return createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          foo: String
          headers: [[String!]!]!
        }
      `,
      resolvers: {
        Query: {
          foo: () => 'bar',
          headers: (_parent, _args, context) => {
            const headersArray: [string, string][] = [];
            context.request.headers.forEach((value, key) => {
              headersArray.push([key, value]);
            });
            return headersArray;
          },
        },
      },
    });
  }
  const upstreamAPI = createYoga({
    schema: createUpstreamSchema(),
    logging: isDebug(),
  });
  const upstreamFetch = function (url: string, init: RequestInit) {
    if (upstreamIsDownForNextRequest) {
      upstreamIsDownForNextRequest = false;
      return Response.error();
    }
    return upstreamAPI.fetch(url, init);
  };
  const serveRuntimes = {
    proxyAPI: createGatewayRuntime({
      logging: isDebug(),
      proxy: {
        endpoint: 'http://localhost:4000/graphql',
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
          upstreamFetch,
        ),
      ],
    }),
    supergraphAPI: createSupergraphRuntime(),
  };
  describe('Endpoints', () => {
    Object.entries(serveRuntimes).forEach(([name, gateway]) => {
      describe(name, () => {
        describe('health check', () => {
          it('succeed even if the upstream API is down', async () => {
            const res = await gateway.fetch(
              'http://localhost:4000/healthcheck',
            );
            expect(res.status).toBe(200);
          });
          it('succeed if the upstream API is up', async () => {
            const res = await gateway.fetch(
              'http://localhost:4000/healthcheck',
            );
            expect(res.status).toBe(200);
          });
        });
        describe('readiness check', () => {
          it('fail if the upstream API is not ready', async () => {
            upstreamIsDownForNextRequest = true;
            const res = await gateway.fetch('http://localhost:4000/readiness');
            expect(res.status).toBe(503);
          });
          it('succeed if the upstream API is ready', async () => {
            const res = await gateway.fetch('http://localhost:4000/readiness');
            expect(res.status).toBe(200);
          });
        });
        describe('GraphiQL', () => {
          it('has correct GraphiQL title', async () => {
            const res = await gateway.fetch('http://localhost:4000/graphql', {
              headers: {
                accept: 'text/html',
              },
            });
            const text = await res.text();
            expect(text).toContain('<title>Hive Gateway</title>');
          });
        });
      });
    });
  });
  it('skips validation when disabled', async () => {
    const schema = buildSchema(
      /* GraphQL */ `
        type Query {
          foo: String
        }
      `,
      { noLocation: true },
    );
    const fetchFn = (async (_url: string, options: RequestInit) => {
      // Return a schema
      if (typeof options.body === 'string') {
        if (options.body?.includes('__schema')) {
          return Response.json({
            data: introspectionFromSchema(schema),
          });
        }
        // But respect the invalid query
        if (options.body?.includes('bar')) {
          return Response.json({ data: { bar: 'baz' } });
        }
      }
      return Response.error();
    }) as typeof fetch;
    let mockValidateFn;
    let fetchedSchema: GraphQLSchema;
    const mockPlugin: GatewayPlugin = {
      onSchemaChange({ schema }) {
        fetchedSchema = schema;
      },
      onValidate({ validateFn, setValidationFn }) {
        mockValidateFn = vi.fn(validateFn);
        setValidationFn(mockValidateFn);
      },
    };
    await using gateway = createGatewayRuntime({
      skipValidation: true,
      proxy: {
        endpoint: 'http://localhost:4000/graphql',
      },
      plugins: () => [useCustomFetch(fetchFn), mockPlugin],
      logging: isDebug(),
    });
    const res = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            bar
          }
        `,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      data: {
        bar: 'baz',
      },
    });
    expect(mockValidateFn).toHaveBeenCalledTimes(0);
    expect(printSchema(fetchedSchema!)).toBe(printSchema(schema));
  });
  it('should invoke onSchemaChange hooks as soon as schema changes', async () => {
    let onSchemaChangeCalls = 0;

    await new Promise<void>((done) => {
      const serve = createGatewayRuntime({
        logging: isDebug(),
        pollingInterval: 500,
        supergraph() {
          if (onSchemaChangeCalls > 0) {
            // change schema after onSchemaChange was invoked
            return /* GraphQL */ `
              type Query {
                hello: Int!
              }
            `;
          }

          return /* GraphQL */ `
            type Query {
              world: String!
            }
          `;
        },
        plugins: () => [
          {
            onSchemaChange() {
              if (onSchemaChangeCalls === 1) {
                // schema changed for the second time
                done();
              }
              onSchemaChangeCalls++;
              serve[DisposableSymbols.asyncDispose]();
            },
          },
        ],
      });

      // trigger mesh
      serve.fetch('http://mesh/graphql?query={__typename}');

      globalThis.setTimeout(() => {
        // trigger mesh again
        serve.fetch('http://mesh/graphql?query={__typename}');
      }, 1000);
    });
  });
  it('should not invoke onSchemaChange hooks when schema does not change', async () => {
    let onSchemaChangeCalls = 0;
    let supergraphFetcherCalls = 0;

    const gwRuntime = createGatewayRuntime({
      logging: isDebug(),
      pollingInterval: 500,
      supergraph() {
        supergraphFetcherCalls++;
        return /* GraphQL */ `
          type Query {
            world: String!
          }
        `;
      },
      plugins: () => [
        {
          onSchemaChange() {
            onSchemaChangeCalls++;
          },
        },
      ],
    });

    async function triggerGw() {
      const res = await gwRuntime.fetch(
        'http://gateway/graphql?query={__typename}',
      );
      expect(res.ok).toBeTruthy();
      expect(await res.json()).toMatchObject({
        data: {
          __typename: 'Query',
        },
      });
    }
    // trigger gw
    await triggerGw();
    expect(onSchemaChangeCalls).toBe(1);
    expect(supergraphFetcherCalls).toBe(1);

    await new Promise<void>((resolve, reject) => {
      globalThis.setTimeout(async () => {
        try {
          // trigger gateway again
          await triggerGw();
          expect(onSchemaChangeCalls).toBe(1);
          expect(supergraphFetcherCalls).toBe(2);
          await gwRuntime[DisposableSymbols.asyncDispose]();
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 2000);
    });
  });

  describe('Cache', () => {
    function createCache(cachedSupergraph?: string) {
      return {
        get: vi.fn((_key) => {
          return fakePromise(cachedSupergraph);
        }),
        set: vi.fn((_key, _value, _options) => {
          return fakePromise();
        }),
        delete() {
          return fakeRejectPromise('noop');
        },
        getKeysByPrefix() {
          return fakeRejectPromise('noop');
        },
      } satisfies KeyValueCache;
    }

    it('should lookup cache, set supergraph and use default ttl', async () => {
      const cache = createCache();
      await using gw = createGatewayRuntime({
        logging: isDebug(),
        cache,
        supergraph: () =>
          getUnifiedGraphGracefully([
            {
              name: 'upstream',
              schema: createUpstreamSchema(),
              url: 'http://localhost:4000/graphql',
            },
          ]),
        plugins: () => [
          useCustomFetch(
            // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
            upstreamFetch,
          ),
        ],
      });

      const res = await gw.fetch('http://localhost:4000/readiness');
      expect(res.ok).toBeTruthy();

      const supergraphCacheKey = 'hive-gateway:supergraph';
      expect(cache.get).toHaveBeenCalledWith(supergraphCacheKey);
      expect(cache.set.mock.lastCall?.[0]).toBe(supergraphCacheKey);
      expect(cache.set.mock.lastCall?.[1]).toContain(
        'type Query @join__type(graph: UPSTREAM)',
      );
      expect(cache.set.mock.lastCall?.[2]).toEqual({
        ttl: 60, // default ttl is 60s
      });
    });

    it('should set supergraph with polling interval as ttl converted to seconds', async () => {
      const cache = createCache();
      await using gw = createGatewayRuntime({
        logging: isDebug(),
        cache,
        pollingInterval: 10_000,
        supergraph: () =>
          getUnifiedGraphGracefully([
            {
              name: 'upstream',
              schema: createUpstreamSchema(),
              url: 'http://localhost:4000/graphql',
            },
          ]),
        plugins: () => [
          useCustomFetch(
            // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
            upstreamFetch,
          ),
        ],
      });

      const res = await gw.fetch('http://localhost:4000/readiness');
      expect(res.ok).toBeTruthy();

      expect(cache.set.mock.lastCall?.[2]).toEqual({
        ttl: 10, // 10_000ms is 10s
      });
    });

    it('should use supergraph from cache', async () => {
      const cache = createCache(
        getUnifiedGraphGracefully([
          {
            name: 'upstream',
            schema: createUpstreamSchema(),
            url: 'http://localhost:4000/graphql',
          },
        ]),
      );

      await using gw = createGatewayRuntime({
        logging: isDebug(),
        cache,
        supergraph: () => {
          throw new Error('Not using cache!');
        },
        plugins: () => [
          useCustomFetch(
            // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
            upstreamFetch,
          ),
        ],
      });

      const res = await gw.fetch('http://localhost:4000/graphql?query={foo}');
      expect(res.ok).toBeTruthy();
      expect(await res.json()).toEqual({
        data: {
          foo: 'bar',
        },
      });
    });
  });

  it('calls subgraph fetcher correctly', async () => {
    const openapiRouter = createRouter().route({
      path: '/greetings',
      method: 'GET',
      schemas: {
        responses: {
          200: Type.Object({
            message: Type.String(),
          }),
        },
      },
      handler: () => Response.json({ message: 'Hello, world!' }),
    });
    let subgraphCallCnt = 0;
    const subgraphDeferred = createDeferred<GraphQLSchema>();
    await using subgraphRuntime = createGatewayRuntime({
      subgraph() {
        subgraphCallCnt++;
        return subgraphDeferred.promise;
      },
      transports: {
        rest: restTransport,
      },
      plugins() {
        return [useCustomFetch(openapiRouter.fetch)];
      },
    });
    const dummyLogger: Logger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => dummyLogger),
    };
    const { schema$ } = loadOpenAPISubgraph('my-subgraph', {
      source: 'http://localhost:4001/openapi.json',
      endpoint: 'http://localhost:4001',
      fetch: openapiRouter.fetch,
    })({ fetch: openapiRouter.fetch, cwd: process.cwd(), logger: dummyLogger });
    const subgraphSchema = await schema$;

    const resp1$ = subgraphRuntime.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            _service {
              sdl
            }
          }
        `,
      }),
    });
    const resp2$ = subgraphRuntime.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            greetings {
              message
            }
          }
        `,
      }),
    });
    subgraphDeferred.resolve(subgraphSchema);
    const [resp1, resp2] = await Promise.all([resp1$, resp2$]);
    expect(await resp1.json()).toEqual({
      data: {
        _service: {
          sdl: printSchemaWithDirectives(subgraphSchema),
        },
      },
    });
    expect(resp1.ok).toBeTruthy();
    expect(await resp2.json()).toEqual({
      data: {
        greetings: {
          message: 'Hello, world!',
        },
      },
    });
    expect(resp2.ok).toBeTruthy();
    expect(subgraphCallCnt).toBe(1);
  });

  it('proxy mode respects transportEntries in the config', async () => {
    const proxyWithCustomHeaders = createGatewayRuntime({
      logging: isDebug(),
      proxy: {
        endpoint: 'http://localhost:4000/graphql',
      },
      transportEntries: {
        '*.http': {
          headers: [['x-custom-header', 'my-custom-value']],
        },
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
          upstreamFetch,
        ),
      ],
    });
    const res = await proxyWithCustomHeaders.fetch(
      'http://localhost:4000/graphql',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: /* GraphQL */ `
            query {
              headers
            }
          `,
        }),
      },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      data: {
        headers: expect.arrayContaining([
          expect.arrayContaining(['x-custom-header', 'my-custom-value']),
        ]),
      },
    });
  });
});
