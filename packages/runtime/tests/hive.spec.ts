import { setTimeout } from 'timers/promises';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import {
  fakePromise,
  MaybePromise,
  printSchemaWithDirectives,
} from '@graphql-tools/utils';
import {
  createDeferredPromise,
  createDisposableServer,
  executeFetch,
  handleMaybePromise,
  initForExecuteFetchArgs,
  isDebug,
} from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
import { createServerAdapter } from '@whatwg-node/server';
import {
  buildClientSchema,
  getIntrospectionQuery,
  GraphQLSchema,
  printSchema,
  type ExecutionResult,
  type IntrospectionQuery,
} from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it, vi } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';
import { useCustomFetch } from '../src/plugins/useCustomFetch';

// Workaround to use `Request` outside of the handler
function cloneRequest(req: Request): MaybePromise<Request> {
  return req.json().then((json) => ({
    ...req,
    headers: req.headers,
    json: () => fakePromise(json),
  }));
}

function createUpstreamSchema() {
  return createSchema({
    typeDefs: /* GraphQL */ `
        """
        Fetched on ${new Date().toISOString()}
        """
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

describe('Hive CDN', () => {
  it('respects env vars', async () => {
    await using cdnServer = await createDisposableServer(
      createServerAdapter(
        () =>
          new Response(
            getUnifiedGraphGracefully([
              {
                name: 'upstream',
                schema: createUpstreamSchema(),
                url: 'http://upstream/graphql',
              },
            ]),
          ),
      ),
    );
    await using gateway = createGatewayRuntime({
      supergraph: {
        type: 'hive',
        endpoint: cdnServer.url,
        key: 'key',
      },
      logging: isDebug(),
    });

    const res = await gateway.fetch(
      'http://localhost/graphql',
      initForExecuteFetchArgs({
        query: getIntrospectionQuery({
          descriptions: false,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const resJson: ExecutionResult<IntrospectionQuery> = await res.json();
    const clientSchema = buildClientSchema(resJson.data!);
    expect(printSchema(clientSchema)).toMatchSnapshot('hive-cdn');
  });
  it('uses Hive CDN instead of introspection for Proxy mode', async () => {
    const upstreamSchema = createUpstreamSchema();
    await using cdnServer = await createDisposableServer(
      createServerAdapter(
        () => new Response(printSchemaWithDirectives(upstreamSchema)),
      ),
    );
    await using upstreamServer = createYoga({
      schema: upstreamSchema,
      // Make sure introspection is not fetched from the service itself
      plugins: [useDisableIntrospection()],
    });
    let schemaChangeSpy = vi.fn((_schema: GraphQLSchema) => {});
    const hiveEndpoint = cdnServer.url;
    const hiveKey = 'key';
    await using gateway = createGatewayRuntime({
      proxy: { endpoint: 'http://upstream/graphql' },
      schema: {
        type: 'hive',
        endpoint: hiveEndpoint,
        key: hiveKey,
      },
      plugins: () => [
        useCustomFetch((url, opts): MaybePromise<Response> => {
          if (url === 'http://upstream/graphql') {
            // @ts-expect-error - Fetch signature is not compatible
            return upstreamServer.fetch(url, opts);
          }
          return gateway.fetchAPI.Response.error();
        }),
        {
          onSchemaChange({ schema }) {
            schemaChangeSpy(schema);
          },
        },
      ],
      logging: isDebug(),
    });

    await expect(
      executeFetch(gateway, {
        query: /* GraphQL */ `
          query {
            foo
          }
        `,
      }),
    ).resolves.toEqual({
      data: {
        foo: 'bar',
      },
    });
    expect(schemaChangeSpy).toHaveBeenCalledTimes(1);
    expect(printSchema(schemaChangeSpy.mock.calls[0]?.[0]!)).toBe(
      printSchema(upstreamSchema),
    );
  });
  it('handles reporting', async () => {
    const token = 'secret';

    const { promise: waitForUsageReq, resolve: usageReq } =
      createDeferredPromise<Request>();
    await using cdnServer = await createDisposableServer(
      createServerAdapter((req) =>
        handleMaybePromise(
          () => cloneRequest(req),
          (req) => {
            usageReq(req);
            return new Response();
          },
        ),
      ),
    );
    await using upstreamServer = await createDisposableServer(
      createYoga({ schema: createUpstreamSchema() }),
    );
    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: `${upstreamServer.url}/graphql`,
      },
      reporting: {
        type: 'hive',
        token,
        printTokenInfo: false,
        selfHosting: {
          graphqlEndpoint: cdnServer.url + '/graphql',
          applicationUrl: cdnServer.url,
          usageEndpoint: cdnServer.url,
        },
        agent: {
          sendInterval: 0,
        },
      },
      logging: isDebug(),
    });

    await expect(
      executeFetch(gateway, {
        query: /* GraphQL */ `
          {
            foo
          }
        `,
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "foo": "bar",
        },
      }
    `);

    const req = await waitForUsageReq;

    expect(req.headers.get('authorization')).toBe(`Bearer ${token}`);
    expect(req.headers.get('user-agent')).toContain('hive-gateway/');
    const body = await req.json();
    expect(body).toEqual(
      expect.objectContaining({
        map: expect.any(Object),
        operations: expect.any(Array),
        size: 1,
      }),
    );

    await setTimeout(10); // allow hive client to flush before disposing
    // TODO: gateway.dispose() should be enough but it isnt, leaktests report a leak
  });
  it('handles persisted documents without reporting', async () => {
    const token = 'secret';
    await using cdnServer = await createDisposableServer(
      createServerAdapter((req) => {
        if (
          req.url.endsWith(
            '/apps/graphql-app/1.0.0/Eaca86e9999dce9b4f14c4ed969aca3258d22ed00',
          )
        ) {
          const hiveCdnKey = req.headers.get('x-hive-cdn-key');
          if (hiveCdnKey !== token) {
            return new Response('Unauthorized', { status: 401 });
          }
          return new Response(/* GraphQL */ `
            query MyTest {
              foo
            }
          `);
        }
        return new Response('Not Found', { status: 404 });
      }),
    );
    await using upstreamServer = await createDisposableServer(
      createYoga({
        schema: createSchema({
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
        }),
      }),
    );
    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: `${upstreamServer.url}/graphql`,
      },
      persistedDocuments: {
        type: 'hive',
        endpoint: cdnServer.url,
        token,
      },
      logging: isDebug(),
    });

    await expect(
      executeFetch(gateway, {
        documentId:
          'graphql-app~1.0.0~Eaca86e9999dce9b4f14c4ed969aca3258d22ed00',
      }),
    ).resolves.toEqual({
      data: {
        foo: 'bar',
      },
    });
  });
  it('handles persisted documents with reporting', async () => {
    const token = 'secret';
    const { promise: waitForUsageReq, resolve: usageReq } =
      createDeferredPromise<Request>();
    await using cdnServer = await createDisposableServer(
      createServerAdapter((req) => {
        if (
          req.url.endsWith(
            '/apps/graphql-app/1.0.0/Eaca86e9999dce9b4f14c4ed969aca3258d22ed00',
          )
        ) {
          const hiveCdnKey = req.headers.get('x-hive-cdn-key');
          if (hiveCdnKey !== token) {
            return new Response('Unauthorized', { status: 401 });
          }
          return new Response(/* GraphQL */ `
            query MyTest {
              foo
            }
          `);
        }
        return handleMaybePromise(
          () => cloneRequest(req),
          (req) => {
            usageReq(req);
            return new Response();
          },
        );
      }),
    );
    await using upstreamServer = await createDisposableServer(
      createYoga<{}>({
        schema: createSchema({
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
        }),
      }),
    );
    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: `${upstreamServer.url}/graphql`,
      },
      reporting: {
        type: 'hive',
        token,
        printTokenInfo: false,
        selfHosting: {
          graphqlEndpoint: cdnServer.url + '/graphql',
          applicationUrl: cdnServer.url,
          usageEndpoint: cdnServer.url,
        },
        agent: {
          sendInterval: 0,
        },
      },
      persistedDocuments: {
        type: 'hive',
        endpoint: cdnServer.url,
        token,
      },
      logging: isDebug(),
    });
    await expect(
      executeFetch(gateway, {
        documentId:
          'graphql-app~1.0.0~Eaca86e9999dce9b4f14c4ed969aca3258d22ed00',
      }),
    ).resolves.toEqual({
      data: {
        foo: 'bar',
      },
    });

    const req = await waitForUsageReq;

    expect(req.headers.get('authorization')).toBe(`Bearer ${token}`);
    expect(req.headers.get('user-agent')).toContain('hive-gateway/');
    const body = await req.json();
    expect(body).toEqual(
      expect.objectContaining({
        map: expect.any(Object),
        operations: expect.any(Array),
        size: 1,
      }),
    );

    await setTimeout(10); // allow hive client to flush before disposing
    // TODO: gateway.dispose() should be enough but it isnt, leaktests report a leak
  });

  it('should handle supergraph cdn circuit breaker when first endpoint is unavailable', async () => {
    const upstreamSchema = createUpstreamSchema();

    await using upstreamServer = createYoga({
      schema: upstreamSchema,
      // Make sure introspection is not fetched from the service itself
      plugins: [useDisableIntrospection()],
    });

    await using cdnServer = await createDisposableServer(
      createServerAdapter(() => new Response(null, { status: 504 })),
    );

    await using cdnMirrorServer = await createDisposableServer(
      createServerAdapter(
        () =>
          new Response(
            getUnifiedGraphGracefully([
              {
                name: 'upstream',
                schema: upstreamSchema,
                url: 'http://upstream/graphql',
              },
            ]),
          ),
      ),
    );

    await using gateway = createGatewayRuntime({
      supergraph: {
        type: 'hive',
        endpoint: [cdnServer.url, cdnMirrorServer.url],
        key: 'key',
      },
      plugins: () => [
        {
          onFetch({ url, setFetchFn }) {
            if (url === 'http://upstream/graphql') {
              // @ts-expect-error - Fetch signature is not compatible
              setFetchFn(upstreamServer.fetch);
            }
          },
        },
      ],
    });

    const res = await gateway.fetch(
      'http://localhost/graphql',
      initForExecuteFetchArgs({
        query: /* GraphQL */ `
          {
            foo
          }
        `,
      }),
    );

    expect(res.ok).toBeTruthy();
    await expect(res.json()).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "foo": "bar",
        },
      }
    `);
  });

  it('should handle persisted documents cdn circuit breaker when first endpoint is unavailable', async () => {
    const upstreamSchema = createUpstreamSchema();

    await using upstreamServer = await createDisposableServer(
      createYoga({
        schema: upstreamSchema,
      }),
    );

    await using cdnServer = await createDisposableServer(
      createServerAdapter(() => new Response(null, { status: 504 })),
    );

    await using cdnMirrorServer = await createDisposableServer(
      createServerAdapter(() => {
        return new Response(/* GraphQL */ `
          query MyTest {
            foo
          }
        `);
      }),
    );

    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: `${upstreamServer.url}/graphql`,
      },
      persistedDocuments: {
        type: 'hive',
        endpoint: [cdnServer.url, cdnMirrorServer.url],
        token: 'token',
      },
    });

    await expect(
      executeFetch(gateway, {
        documentId:
          'graphql-app~1.0.0~Eaca86e9999dce9b4f14c4ed969aca3258d22ed00',
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "foo": "bar",
        },
      }
    `);
  });
});
