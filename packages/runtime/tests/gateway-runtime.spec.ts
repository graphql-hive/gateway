import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { KeyValueCache } from '@graphql-mesh/types';
import { isDebug } from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { Response } from '@whatwg-node/server';
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
        }
      `,
      resolvers: {
        Query: {
          foo: () => 'bar',
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
    });
  });

  describe('Cache', () => {
    function createCache(cachedSupergraph?: string) {
      return {
        get: vi.fn((_key) => {
          return Promise.resolve(cachedSupergraph);
        }),
        set: vi.fn((_key, _value, _options) => {
          return Promise.resolve();
        }),
        delete() {
          return Promise.reject('noop');
        },
        getKeysByPrefix() {
          return Promise.reject('noop');
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
      expect(cache.get).toBeCalledWith(supergraphCacheKey);
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
});
