import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { createSchema, createYoga } from 'graphql-yoga';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MCPOperationsLoader } from '../src/plugin.js';
import { useMCP } from '../src/plugin.js';

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
) {
  // Warm the schema so the registry is built
  await gateway.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ __typename }' }),
  });
  return gateway.fetch('http://localhost/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }),
  });
}

describe('MCPOperationsLoader lifecycle', () => {
  let gateway: ReturnType<typeof createGatewayRuntime> | null = null;

  afterEach(() => {
    gateway?.[Symbol.asyncDispose]?.();
    gateway = null;
  });

  it('load() provides operations that register as tools via @mcpTool', async () => {
    gateway = createGateway({
      async load() {
        return `
          query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
            weather(location: $location) { temperature conditions }
          }
        `;
      },
    });

    const res = await mcpRequest(gateway, {
      method: 'tools/list',
    });
    const json = await res.json();
    const names = json.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('get_weather');
  });

  it('load() rejection is caught and plugin continues without loader tools', async () => {
    gateway = createGatewayRuntime({
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
          loader: {
            async load() {
              throw new Error('network failure');
            },
          },
        }),
      ],
    });

    // Should not throw, plugin continues without loader tools
    const res = await mcpRequest(gateway, {
      method: 'tools/list',
    });
    const json = await res.json();
    expect(json.result.tools).toEqual([]);
  });

  it('onUpdate callback triggers tool rebuild', async () => {
    let updateCallback: ((source: string) => void) | null = null;

    gateway = createGateway({
      async load() {
        return `
          query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
            weather(location: $location) { temperature conditions }
          }
        `;
      },
      onUpdate(callback) {
        updateCallback = callback;
        return () => {
          updateCallback = null;
        };
      },
    });

    // Initial load
    let res = await mcpRequest(gateway, { method: 'tools/list' });
    let json = await res.json();
    let names = json.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(['get_weather']);

    // Push an update that adds a second tool
    updateCallback!(
      `
        query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
          weather(location: $location) { temperature conditions }
        }
        query SayHello($name: String!) @mcpTool(name: "say_hello", description: "Greet") {
          hello(name: $name)
        }
      `,
    );

    res = await mcpRequest(gateway, { method: 'tools/list' });
    json = await res.json();
    names = json.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('get_weather');
    expect(names).toContain('say_hello');
  });

  it('onUpdate with invalid GraphQL keeps previous tools', async () => {
    let updateCallback: ((source: string) => void) | null = null;

    gateway = createGateway({
      async load() {
        return `
          query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
            weather(location: $location) { temperature conditions }
          }
        `;
      },
      onUpdate(callback) {
        updateCallback = callback;
      },
    });

    // Initial load
    let res = await mcpRequest(gateway, { method: 'tools/list' });
    let json = await res.json();
    expect(json.result.tools).toHaveLength(1);

    // Push broken GraphQL -- should not crash, should keep previous tools
    updateCallback!('this is not valid graphql {{{');

    res = await mcpRequest(gateway, { method: 'tools/list' });
    json = await res.json();
    expect(json.result.tools).toHaveLength(1);
    expect(json.result.tools[0].name).toBe('get_weather');
  });

  it('onDispose calls the cleanup function from onUpdate', async () => {
    const cleanupSpy = vi.fn();

    gateway = createGateway({
      async load() {
        return `
          query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
            weather(location: $location) { temperature conditions }
          }
        `;
      },
      onUpdate(_callback) {
        return cleanupSpy;
      },
    });

    // Warm up so load() resolves
    await mcpRequest(gateway, { method: 'tools/list' });

    expect(cleanupSpy).not.toHaveBeenCalled();
    await gateway[Symbol.asyncDispose]();
    expect(cleanupSpy).toHaveBeenCalledOnce();

    // Prevent afterEach from double-disposing
    gateway = null;
  });

  it('onDispose before load() resolves does not leak subscription', async () => {
    const onUpdateSpy = vi.fn();
    let resolveLoad: (value: string) => void;
    const loadPromise = new Promise<string>((r) => {
      resolveLoad = r;
    });

    gateway = createGateway({
      load: () => loadPromise,
      onUpdate: onUpdateSpy,
    });

    // Dispose immediately, before load resolves
    await gateway[Symbol.asyncDispose]();
    gateway = null;

    // Now resolve load -- onUpdate should NOT be called because plugin is disposed
    resolveLoad!(
      `query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
        weather(location: $location) { temperature }
      }`,
    );

    // Give the microtask queue time to flush
    await new Promise((r) => setTimeout(r, 10));

    expect(onUpdateSpy).not.toHaveBeenCalled();
  });

  it('onDispose catches cleanup function that throws', async () => {
    gateway = createGateway({
      async load() {
        return `
          query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
            weather(location: $location) { temperature conditions }
          }
        `;
      },
      onUpdate(_callback) {
        return () => {
          throw new Error('cleanup exploded');
        };
      },
    });

    // Warm up so load resolves and onUpdate registers
    await mcpRequest(gateway, { method: 'tools/list' });

    // Should not throw
    await gateway[Symbol.asyncDispose]();
    gateway = null;
  });

  it('tools/call works with loader-sourced operations', async () => {
    gateway = createGateway({
      async load() {
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
