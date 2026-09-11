import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { createSchema, createYoga } from 'graphql-yoga';
import { afterEach, describe, expect, it } from 'vitest';
import type { MCPOperationsLoader } from '../src/plugin.js';
import { useMCP } from '../src/plugin.js';

describe('MCPOperationsLoader lifecycle', () => {
  const upstream = createYoga({
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello(name: String!): String
          weather(location: String!): Weather
        }
        type Weather {
          temperature: Float
          conditions: String
        }
      `,
      resolvers: {
        Query: {
          hello: (_root, { name }) => `Hello, ${name}!`,
          weather: (_root, { location }) => ({
            temperature: location === 'London' ? 12.5 : 22.0,
            conditions: location === 'London' ? 'Cloudy' : 'Sunny',
          }),
        },
      },
    }),
    logging: false,
  });

  function createGateway(loader: MCPOperationsLoader) {
    return createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url, init) => upstream.fetch(url, init),
        ),
        useMCP(ctx, {
          name: 'loader-test',
          version: '1.0.0',
          loader,
        }),
      ],
    });
  }

  async function mcpRequest(
    gateway: ReturnType<typeof createGatewayRuntime>,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) {
    // Warm the schema so the registry is built
    await gateway.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    return gateway.fetch('http://localhost/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }),
    });
  }

  let gateway: ReturnType<typeof createGatewayRuntime> | null = null;

  afterEach(async () => {
    if (gateway) {
      await gateway[Symbol.asyncDispose]?.();
      gateway = null;
    }
  });

  it('load() provides operations that register as tools via @mcpTool', async () => {
    gateway = createGateway({
      async load(_req) {
        return `
          query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
            weather(location: $location) { temperature conditions }
          }
        `;
      },
    });

    const res = await mcpRequest(gateway, { method: 'tools/list' });
    const json = await res.json();
    const names = json.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('get_weather');
  });

  it('load() rejection is caught and plugin falls back to static registry', async () => {
    gateway = createGateway({
      async load(_req) {
        throw new Error('network failure');
      },
    });

    const res = await mcpRequest(gateway, { method: 'tools/list' });
    const json = await res.json();
    expect(json.result.tools).toEqual([]);
  });

  it('load() returning the same string reuses the cached registry', async () => {
    let callCount = 0;
    gateway = createGateway({
      async load(_req) {
        callCount++;
        return `
          query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
            weather(location: $location) { temperature conditions }
          }
        `;
      },
    });

    // two tools/list requests with the same source
    await mcpRequest(gateway, { method: 'tools/list' });
    await mcpRequest(gateway, { method: 'tools/list' });

    // load() is called twice but registry is built only once (cache hit on second)
    expect(callCount).toBe(2);
    const res = await mcpRequest(gateway, { method: 'tools/list' });
    const json = await res.json();
    expect(json.result.tools).toHaveLength(1);
    expect(json.result.tools[0].name).toBe('get_weather');
  });

  it('load() returning a different string builds a new registry', async () => {
    let toggle = false;
    gateway = createGateway({
      async load(_req) {
        toggle = !toggle;
        if (toggle) {
          return `
            query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
              weather(location: $location) { temperature conditions }
            }
          `;
        }
        return `
          query SayHello($name: String!) @mcpTool(name: "say_hello", description: "Greet") {
            hello(name: $name)
          }
        `;
      },
    });

    const res1 = await mcpRequest(gateway, { method: 'tools/list' });
    const json1 = await res1.json();
    expect(json1.result.tools.map((t: { name: string }) => t.name)).toContain(
      'get_weather',
    );

    const res2 = await mcpRequest(gateway, { method: 'tools/list' });
    const json2 = await res2.json();
    expect(json2.result.tools.map((t: { name: string }) => t.name)).toContain(
      'say_hello',
    );
  });

  it('load() receives the incoming Request object', async () => {
    let capturedReq: Request | null = null;
    gateway = createGateway({
      async load({ request }) {
        capturedReq = request;
        return `
          query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
            weather(location: $location) { temperature conditions }
          }
        `;
      },
    });

    await mcpRequest(gateway, { method: 'tools/list' }, { 'x-tenant': 'acme' });
    expect(capturedReq).not.toBeNull();
    expect(capturedReq!.headers.get('x-tenant')).toBe('acme');
  });

  it('load() invalid GraphQL falls back to static registry', async () => {
    gateway = createGateway({
      async load(_req) {
        return 'this is not valid graphql {{{';
      },
    });

    const res = await mcpRequest(gateway, { method: 'tools/list' });
    const json = await res.json();
    // falls back to static (empty) registry without crashing
    expect(json.result.tools).toEqual([]);
  });

  it('tools/call works with loader-sourced operations', async () => {
    gateway = createGateway({
      async load(_req) {
        return `
          query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
            weather(location: $location) { temperature conditions }
          }
        `;
      },
    });

    const res = await mcpRequest(gateway, {
      method: 'tools/call',
      params: { name: 'get_weather', arguments: { location: 'London' } },
    });
    const json = await res.json();
    expect(json.result.isError).toBe(false);
    expect(json.result.structuredContent.weather.temperature).toBe(12.5);
    expect(json.result.structuredContent.weather.conditions).toBe('Cloudy');
  });
});
