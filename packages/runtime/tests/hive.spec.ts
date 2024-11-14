import { useDisableIntrospection } from '@envelop/disable-introspection';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { createDisposableServer, isDebug } from '@internal/testing';
import {
  buildClientSchema,
  getIntrospectionQuery,
  GraphQLSchema,
  printSchema,
  type ExecutionResult,
  type IntrospectionQuery,
} from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it, vitest } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';
import { useCustomFetch } from '../src/plugins/useCustomFetch';

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
    await using cdnServer = await createDisposableServer((_req, res) => {
      const supergraph = getUnifiedGraphGracefully([
        {
          name: 'upstream',
          schema: createUpstreamSchema(),
          url: 'http://upstream/graphql',
        },
      ]);
      res.end(supergraph);
    });
    await using gateway = createGatewayRuntime({
      supergraph: {
        type: 'hive',
        endpoint: `http://localhost:${cdnServer.address().port}`,
        key: 'key',
      },
      logging: isDebug(),
    });
    const res = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: getIntrospectionQuery({
          descriptions: false,
        }),
      }),
    });

    expect(res.status).toBe(200);
    const resJson: ExecutionResult<IntrospectionQuery> = await res.json();
    const clientSchema = buildClientSchema(resJson.data!);
    expect(printSchema(clientSchema)).toMatchSnapshot('hive-cdn');

    // Landing page
    const landingPageRes = await gateway.fetch('http://localhost:4000', {
      method: 'GET',
      headers: {
        accept: 'text/html',
      },
    });
    const landingPage = await landingPageRes.text();
    expect(landingPage).toContain('Hive CDN');
    expect(landingPage).toContain('upstream');
    expect(landingPage).toContain('http://upstream/graphql');
  });
  it('uses Hive CDN instead of introspection for Proxy mode', async () => {
    const upstreamSchema = createUpstreamSchema();
    await using cdnServer = await createDisposableServer((_req, res) => {
      res.end(
        JSON.stringify({
          sdl: printSchemaWithDirectives(upstreamSchema),
        }),
      );
    });
    const upstreamServer = createYoga({
      schema: upstreamSchema,
      // Make sure introspection is not fetched from the service itself
      plugins: [useDisableIntrospection()],
    });
    let schemaChangeSpy = vitest.fn((_schema: GraphQLSchema) => {});
    const hiveEndpoint = `http://localhost:${cdnServer.address().port}`;
    const hiveKey = 'key';
    await using gateway = createGatewayRuntime({
      proxy: { endpoint: 'http://upstream/graphql' },
      schema: {
        type: 'hive',
        endpoint: hiveEndpoint,
        key: hiveKey,
      },
      plugins: () => [
        useCustomFetch((url, opts): any => {
          if (url === 'http://upstream/graphql') {
            return upstreamServer.fetch(
              // @ts-expect-error TODO: url can be a string, not only an instance of URL
              url,
              opts,
            );
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
    const res = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            foo
          }
        `,
      }),
    });
    const resJson: ExecutionResult = await res.json();
    expect(resJson).toEqual({
      data: {
        foo: 'bar',
      },
    });
    expect(schemaChangeSpy).toHaveBeenCalledTimes(1);
    expect(printSchema(schemaChangeSpy.mock.calls[0]?.[0]!)).toBe(
      printSchema(upstreamSchema),
    );
  });
  it('handles persisted documents without reporting', async () => {
    const token = 'secret';
    await using cdnServer = await createDisposableServer((req, res) => {
      if (
        req.url ===
        '/apps/graphql-app/1.0.0/Eaca86e9999dce9b4f14c4ed969aca3258d22ed00'
      ) {
        const hiveCdnKey = req.headers['x-hive-cdn-key'];
        if (hiveCdnKey !== token) {
          res.statusCode = 401;
          res.end('Unauthorized');
          return;
        }
        res.end(/* GraphQL */ `
          query MyTest {
            foo
          }
        `);
      }
    });
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
        endpoint: `http://localhost:${upstreamServer.address().port}/graphql`,
      },
      persistedDocuments: {
        type: 'hive',
        endpoint: `http://localhost:${cdnServer.address().port}`,
        token,
      },
      logging: isDebug(),
    });
    const res = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        documentId:
          'graphql-app~1.0.0~Eaca86e9999dce9b4f14c4ed969aca3258d22ed00',
      }),
    });
    const resJson: ExecutionResult = await res.json();
    expect(resJson).toEqual({
      data: {
        foo: 'bar',
      },
    });
  });
  it('handles persisted documents with reporting', async () => {
    const token = 'secret';
    await using cdnServer = await createDisposableServer((req, res) => {
      if (
        req.url ===
        '/apps/graphql-app/1.0.0/Eaca86e9999dce9b4f14c4ed969aca3258d22ed00'
      ) {
        const hiveCdnKey = req.headers['x-hive-cdn-key'];
        if (hiveCdnKey !== token) {
          res.statusCode = 401;
          res.end('Unauthorized');
          return;
        }
        res.end(/* GraphQL */ `
          query MyTest {
            foo
          }
        `);
      }
    });
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
        endpoint: `http://localhost:${upstreamServer.address().port}/graphql`,
      },
      reporting: {
        type: 'hive',
        token: '',
      },
      persistedDocuments: {
        type: 'hive',
        endpoint: `http://localhost:${cdnServer.address().port}`,
        token,
      },
      logging: isDebug(),
    });
    const res = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        documentId:
          'graphql-app~1.0.0~Eaca86e9999dce9b4f14c4ed969aca3258d22ed00',
      }),
    });
    const resJson: ExecutionResult = await res.json();
    expect(resJson).toEqual({
      data: {
        foo: 'bar',
      },
    });
  });
});
