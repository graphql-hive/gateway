import { createSchema, createYoga } from 'graphql-yoga';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let mockModule = vi.mock;
if (globalThis.Bun) {
  mockModule = require('bun:test').mock.module;
}
const mockRegisterProvider = vi.fn();
describe('useOpenTelemetry', () => {
  mockModule('@opentelemetry/sdk-trace-web', () => ({
    WebTracerProvider: vi.fn(() => ({ register: mockRegisterProvider })),
  }));

  let gw: typeof import('@graphql-hive/gateway');
  beforeAll(async () => {
    gw = await import('@graphql-hive/gateway');
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });
  describe('when not passing a custom provider', () => {
    it('initializes and starts a new provider', async () => {
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

      await using gateway = gw.createGatewayRuntime({
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

      const response = await gateway.fetch('http://localhost:4000/graphql', {
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
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data?.hello).toBe('World');
      expect(mockRegisterProvider).toHaveBeenCalledTimes(1);
    });
  });

  describe('when passing a custom provider', () => {
    it('does not initialize a new provider and does not start the provided provider instance', async () => {
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

      await using gateway = gw.createGatewayRuntime({
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

      const response = await gateway.fetch('http://localhost:4000/graphql', {
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
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data?.hello).toBe('World');
      expect(mockRegisterProvider).not.toHaveBeenCalled();
    });
  });
});
