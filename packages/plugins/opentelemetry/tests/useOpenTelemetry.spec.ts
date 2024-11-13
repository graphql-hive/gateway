import { createSchema, createYoga } from 'graphql-yoga';
import { beforeAll, beforeEach, describe, expect, it, vitest } from 'vitest';

const mockStartSdk = vitest.fn();

describe('useOpenTelemetry', () => {
  if (process.env['LEAK_TEST']) {
    it('noop', () => {});
    return;
  }
  vitest.mock('@opentelemetry/sdk-node', () => ({
    NodeSDK: vitest.fn(() => ({ start: mockStartSdk })),
  }));

  let gw: typeof import('@graphql-hive/gateway');
  beforeAll(async () => {
    gw = await import('@graphql-hive/gateway');
  });
  beforeEach(() => {
    vitest.clearAllMocks();
  });
  describe('when not passing a custom sdk', () => {
    it('initializes and starts a new NodeSDK', async () => {
      const { useOpenTelemetry } = await import('../src');
      const upstream = createYoga({
        schema: createSchema({
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'World',
            },
          },
        }),
        logging: false,
      });

      await using serveRuntime = gw.createGatewayRuntime({
        proxy: {
          endpoint: 'https://example.com/graphql',
        },
        plugins: (ctx) => [
          gw.useCustomFetch(
            // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
            upstream.fetch,
          ),
          useOpenTelemetry({
            exporters: [],
            ...ctx,
          }),
        ],
        logging: false,
      });

      const response = await serveRuntime.fetch(
        'http://localhost:4000/graphql',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: /* GraphQL */ `
              query {
                hello
              }
            `,
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data?.hello).toBe('World');
      expect(mockStartSdk).toHaveBeenCalledTimes(1);
    });
  });

  describe('when passing a custom sdk', () => {
    it('does not initialize a new NodeSDK and does not start the provided sdk instance', async () => {
      const { useOpenTelemetry } = await import('../src');
      const upstream = createYoga({
        schema: createSchema({
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'World',
            },
          },
        }),
        logging: false,
      });

      await using serveRuntime = gw.createGatewayRuntime({
        proxy: {
          endpoint: 'https://example.com/graphql',
        },
        plugins: (ctx) => [
          gw.useCustomFetch(
            // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
            upstream.fetch,
          ),
          useOpenTelemetry({ initializeNodeSDK: false, ...ctx }),
        ],
        logging: false,
      });

      const response = await serveRuntime.fetch(
        'http://localhost:4000/graphql',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: /* GraphQL */ `
              query {
                hello
              }
            `,
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data?.hello).toBe('World');
      expect(mockStartSdk).not.toHaveBeenCalled();
    });
  });
});
