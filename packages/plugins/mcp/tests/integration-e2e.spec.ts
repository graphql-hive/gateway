import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { createSchema, createYoga } from 'graphql-yoga';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type {
  DescriptionProvider,
  DescriptionProviderContext,
} from '../src/description-provider.js';
import { useMCP } from '../src/plugin.js';

describe('MCP E2E', () => {
  const upstream = createYoga({
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          """
          Get current weather data for a location
          """
          weather(
            """
            City name or coordinates
            """
            location: String!
          ): Weather

          """
          Search for cities by name
          """
          cities(query: String!): [City!]!
        }

        type Weather {
          temperature: Float
          conditions: String
          humidity: Int
        }

        type City {
          name: String
          country: String
          population: Int
        }
      `,
      resolvers: {
        Query: {
          weather: (_root, { location }) => ({
            temperature: location === 'London' ? 12.5 : 22.0,
            conditions: location === 'London' ? 'Cloudy' : 'Sunny',
            humidity: 65,
          }),
          cities: (_root, { query }) => [
            { name: `${query} City`, country: 'US', population: 100000 },
          ],
        },
      },
    }),
    logging: false,
  });

  const gateway = createGatewayRuntime({
    logging: false,
    proxy: {
      endpoint: 'http://upstream:4000/graphql',
    },
    plugins: () => [
      useCustomFetch(
        // @ts-expect-error MeshFetch type mismatch
        (url, init) => upstream.fetch(url, init),
      ),
      useMCP({
        name: 'test-gateway',
        version: '0.1.0',
        tools: [
          {
            name: 'get_weather',
            source: {
              type: 'inline',
              query: `query GetWeather($location: String!) {
                weather(location: $location) {
                  temperature
                  conditions
                  humidity
                }
              }`,
            },
            tool: { title: 'Get Weather' },
          },
          {
            name: 'search_cities',
            source: {
              type: 'inline',
              query: `query SearchCities($query: String!) {
                cities(query: $query) {
                  name
                  country
                  population
                }
              }`,
            },
            tool: { description: 'Search cities by name' },
          },
        ],
      }),
    ],
  });

  afterAll(() => gateway[Symbol.asyncDispose]?.());

  function mcpRequest(
    method: string,
    params: unknown = {},
    id: number | string = 1,
  ) {
    return gateway.fetch('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
  }

  function graphqlRequest(query: string) {
    return gateway.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
  }

  it('initialize returns protocol version and capabilities', async () => {
    const res = await mcpRequest('initialize');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-11-25',
        serverInfo: { name: 'test-gateway', version: '0.1.0' },
        capabilities: { tools: {} },
      },
    });
  });

  it('tools/list returns tools with name, description, inputSchema, and outputSchema', async () => {
    await graphqlRequest('{ __typename }');

    const res = await mcpRequest('tools/list');
    const body = await res.json();
    const tools = body.result.tools;

    expect(tools).toHaveLength(2);

    const weather = tools.find((t: any) => t.name === 'get_weather');
    expect(weather).toBeDefined();
    expect(weather.title).toBe('Get Weather');
    expect(weather.description).toEqual(expect.any(String));
    expect(weather.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        location: { type: 'string' },
      },
      required: ['location'],
    });
    expect(weather.outputSchema).toBeDefined();

    const cities = tools.find((t: any) => t.name === 'search_cities');
    expect(cities).toBeDefined();
    expect(cities.description).toBe('Search cities by name');
    expect(cities.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    });
  });

  it('tools/list auto-descriptions come from gql schema', async () => {
    await graphqlRequest('{ __typename }');

    const res = await mcpRequest('tools/list');
    const body = await res.json();
    const tools = body.result.tools;

    const weather = tools.find((t: any) => t.name === 'get_weather');
    expect(weather.description).toContain('weather');

    expect(weather.inputSchema.properties.location.description).toBe(
      'City name or coordinates',
    );
  });

  it('tools/call executes a tool and returns gql data', async () => {
    await graphqlRequest('{ __typename }');

    const res = await mcpRequest('tools/call', {
      name: 'get_weather',
      arguments: { location: 'London' },
    });
    const body = await res.json();

    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent.weather).toMatchObject({
      temperature: 12.5,
      conditions: 'Cloudy',
      humidity: 65,
    });
  });

  it('tools/call passes arguments correctly', async () => {
    await graphqlRequest('{ __typename }');

    const res = await mcpRequest('tools/call', {
      name: 'search_cities',
      arguments: { query: 'New York' },
    });
    const body = await res.json();

    expect(body.result.structuredContent.cities[0]).toMatchObject({
      name: 'New York City',
      country: 'US',
      population: 100000,
    });
  });

  it('tools/call returns protocol error for unknown tool', async () => {
    await graphqlRequest('{ __typename }');

    const res = await mcpRequest('tools/call', {
      name: 'nonexistent_tool',
      arguments: {},
    });
    const body = await res.json();

    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain('Unknown tool');
    expect(body.error.message).toContain('nonexistent_tool');
    expect(body.result).toBeUndefined();
  });

  it('auto-triggers schema loading when MCP is called before any gql request', async () => {
    const freshGateway = createGatewayRuntime({
      logging: false,
      proxy: {
        endpoint: 'http://upstream:4000/graphql',
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'fresh-gateway',
          tools: [
            {
              name: 'get_weather',
              source: {
                type: 'inline',
                query: `query GetWeather($location: String!) {
                  weather(location: $location) { temperature }
                }`,
              },
              tool: { description: 'Get weather' },
            },
          ],
        }),
      ],
    });

    try {
      const res = await freshGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.result.tools).toHaveLength(1);
      expect(body.result.tools[0].name).toBe('get_weather');
    } finally {
      await freshGateway[Symbol.asyncDispose]?.();
    }
  });

  it('description provider sets tool description via providers config', async () => {
    const mockProvider: DescriptionProvider = {
      fetchDescription: vi.fn(async (_toolName, config) => {
        return `Fetched: ${config['prompt']}`;
      }),
    };

    const providerGateway = createGatewayRuntime({
      logging: false,
      proxy: {
        endpoint: 'http://upstream:4000/graphql',
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'provider-gateway',
          tools: [
            {
              name: 'get_weather',
              source: {
                type: 'inline',
                query: `query GetWeather($location: String!) {
                  weather(location: $location) { temperature conditions }
                }`,
              },
              tool: {
                descriptionProvider: {
                  type: 'mock',
                  prompt: 'weather_description',
                },
              },
            },
            {
              name: 'search_cities',
              source: {
                type: 'inline',
                query: `query SearchCities($query: String!) {
                  cities(query: $query) { name country }
                }`,
              },
              tool: {
                description: 'Config fallback if provider fails',
                descriptionProvider: {
                  type: 'mock',
                  prompt: 'cities_description',
                },
              },
            },
          ],
          providers: { mock: mockProvider },
        }),
      ],
    });

    try {
      await providerGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const res = await providerGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      const body = await res.json();
      const tools = body.result.tools;

      const weather = tools.find((t: any) => t.name === 'get_weather');
      expect(weather.description).toBe('Fetched: weather_description');

      const cities = tools.find((t: any) => t.name === 'search_cities');
      expect(cities.description).toBe('Fetched: cities_description');
      expect(mockProvider.fetchDescription).toHaveBeenCalledTimes(2);
    } finally {
      await providerGateway[Symbol.asyncDispose]?.();
    }
  });

  describe('disableGraphQL', () => {
    const standaloneGateway = createGatewayRuntime({
      logging: false,
      proxy: {
        endpoint: 'http://upstream:4000/graphql',
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'standalone-gateway',
          disableGraphQLEndpoint: true,
          tools: [
            {
              name: 'get_weather',
              source: {
                type: 'inline',
                query: `query GetWeather($location: String!) {
                  weather(location: $location) { temperature conditions humidity }
                }`,
              },
              tool: { description: 'Get weather' },
            },
          ],
        }),
      ],
    });

    afterAll(() => standaloneGateway[Symbol.asyncDispose]?.());

    it('returns 404 for /graphql', async () => {
      const res = await standaloneGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      expect(res.status).toBe(404);
    });

    it('MCP tools/list still works', async () => {
      const res = await standaloneGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.result.tools).toHaveLength(1);
      expect(body.result.tools[0].name).toBe('get_weather');
    });

    it('MCP tools/call executes GraphQL internally', async () => {
      const res = await standaloneGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'get_weather', arguments: { location: 'London' } },
        }),
      });
      const body = await res.json();

      expect(body.result.isError).toBe(false);
      expect(body.result.structuredContent.weather).toMatchObject({
        temperature: 12.5,
        conditions: 'Cloudy',
        humidity: 65,
      });
    });
  });

  it('forwards headers from MCP request to internal dispatch', async () => {
    let capturedRequest: Request | undefined;

    const headerGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: () => [
        {
          onRequestParse({ request }: { request: Request }) {
            capturedRequest = request;
          },
        } as any,
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'header-gateway',
          tools: [
            {
              name: 'get_weather',
              source: {
                type: 'inline',
                query: `query($location: String!) { weather(location: $location) { temperature } }`,
              },
              tool: { description: 'Get weather' },
            },
          ],
        }),
      ],
    });

    try {
      // Trigger schema load
      await headerGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      capturedRequest = undefined;

      await headerGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token-123',
          'X-Custom-Header': 'custom-value',
          'X-Request-Id': 'req-456',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get_weather', arguments: { location: 'London' } },
        }),
      });

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest!.headers.get('authorization')).toBe(
        'Bearer test-token-123',
      );
      expect(capturedRequest!.headers.get('x-custom-header')).toBe(
        'custom-value',
      );
      expect(capturedRequest!.headers.get('x-request-id')).toBe('req-456');
    } finally {
      await headerGateway[Symbol.asyncDispose]?.();
    }
  });

  it('argument aliasing renames input and de-aliases on call', async () => {
    await graphqlRequest('{ __typename }');

    const aliasGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'alias-gateway',
          tools: [
            {
              name: 'get_weather',
              source: {
                type: 'inline',
                query: `query($location: String!) {
                  weather(location: $location) { temperature conditions }
                }`,
              },
              tool: { description: 'Get weather' },
              input: {
                schema: {
                  properties: {
                    location: { alias: 'city' },
                  },
                },
              },
            },
          ],
        }),
      ],
    });

    try {
      await aliasGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      // tools/list should show aliased name
      const listRes = await aliasGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      const listBody = await listRes.json();
      const tool = listBody.result.tools[0];
      expect(tool.inputSchema.properties.city).toBeDefined();
      expect(tool.inputSchema.properties.location).toBeUndefined();
      expect(tool.inputSchema.required).toContain('city');

      // tools/call with alias should work
      const callRes = await aliasGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'get_weather', arguments: { city: 'London' } },
        }),
      });
      const callBody = await callRes.json();
      expect(callBody.result.structuredContent.weather.temperature).toBe(12.5);
      expect(callBody.result.structuredContent.weather.conditions).toBe(
        'Cloudy',
      );
    } finally {
      await aliasGateway[Symbol.asyncDispose]?.();
    }
  });

  it('per-field description provider overrides field descriptions', async () => {
    const fieldProvider: DescriptionProvider = {
      fetchDescription: vi.fn(async (_toolName, config) => {
        return `From provider: ${config['prompt']}`;
      }),
    };

    const fieldGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'field-provider-gateway',
          providers: { mock: fieldProvider },
          tools: [
            {
              name: 'get_weather',
              source: {
                type: 'inline',
                query: `query($location: String!) {
                  weather(location: $location) { temperature }
                }`,
              },
              tool: { description: 'Get weather' },
              input: {
                schema: {
                  properties: {
                    location: {
                      descriptionProvider: {
                        type: 'mock',
                        prompt: 'location_desc',
                      },
                    },
                  },
                },
              },
            },
          ],
        }),
      ],
    });

    try {
      await fieldGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const res = await fieldGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      const body = await res.json();

      expect(
        body.result.tools[0].inputSchema.properties.location.description,
      ).toBe('From provider: location_desc');
      expect(fieldProvider.fetchDescription).toHaveBeenCalled();
    } finally {
      await fieldGateway[Symbol.asyncDispose]?.();
    }
  });

  it('alias + per-field descriptionProvider combined', async () => {
    const fieldProvider: DescriptionProvider = {
      fetchDescription: vi.fn(async (_toolName, config) => {
        return `Provider: ${config['prompt']}`;
      }),
    };

    const comboGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'combo-gateway',
          providers: { mock: fieldProvider },
          tools: [
            {
              name: 'search_cities',
              source: {
                type: 'inline',
                query: `query($query: String!) {
                  cities(query: $query) { name country }
                }`,
              },
              tool: { description: 'Search cities' },
              input: {
                schema: {
                  properties: {
                    query: {
                      alias: 'searchTerm',
                      descriptionProvider: {
                        type: 'mock',
                        prompt: 'search_query_desc',
                      },
                    },
                  },
                },
              },
            },
          ],
        }),
      ],
    });

    try {
      await comboGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      // tools/list: alias applied + provider description on aliased field
      const listRes = await comboGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      const listBody = await listRes.json();
      const tool = listBody.result.tools[0];
      expect(tool.inputSchema.properties.searchTerm).toBeDefined();
      expect(tool.inputSchema.properties.query).toBeUndefined();
      expect(tool.inputSchema.properties.searchTerm.description).toBe(
        'Provider: search_query_desc',
      );

      // tools/call: alias de-aliased, query executes correctly
      const callRes = await comboGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'search_cities',
            arguments: { searchTerm: 'New York' },
          },
        }),
      });
      const callBody = await callRes.json();
      expect(callBody.result.structuredContent.cities[0].name).toBe(
        'New York City',
      );
    } finally {
      await comboGateway[Symbol.asyncDispose]?.();
    }
  });

  it('output.path extracts subset of response data', async () => {
    const pathGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'path-gateway',
          tools: [
            {
              name: 'search_cities',
              source: {
                type: 'inline',
                query: `query SearchCities($query: String!) {
                  cities(query: $query) { name country population }
                }`,
              },
              tool: { description: 'Search cities' },
              output: { path: 'cities' },
            },
          ],
        }),
      ],
    });

    try {
      await pathGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      // tools/call should return just the cities array, not { cities: [...] }
      const res = await pathGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'search_cities', arguments: { query: 'New York' } },
        }),
      });
      const body = await res.json();

      // structuredContent should be the extracted array directly
      expect(body.result.structuredContent).toEqual([
        { name: 'New York City', country: 'US', population: 100000 },
      ]);

      // Output schema should also be narrowed
      const listRes = await pathGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });
      const listBody = await listRes.json();
      const tool = listBody.result.tools[0];
      // Output schema should describe an array of city objects, not { cities: [...] }
      expect(tool.outputSchema.type).toBe('array');
      expect(tool.outputSchema.items.properties.name).toBeDefined();
    } finally {
      await pathGateway[Symbol.asyncDispose]?.();
    }
  });

  it('promptLabel query param flows context to description providers', async () => {
    const capturedContexts: (DescriptionProviderContext | undefined)[] = [];
    const contextProvider: DescriptionProvider = {
      fetchDescription: vi.fn(async (_toolName, _, context) => {
        capturedContexts.push(context);
        return `Desc with label=${context?.label ?? 'none'}`;
      }),
    };

    const labelGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'label-gateway',
          providers: { mock: contextProvider },
          tools: [
            {
              name: 'get_weather',
              source: {
                type: 'inline',
                query: `query($location: String!) {
                  weather(location: $location) { temperature }
                }`,
              },
              tool: {
                descriptionProvider: { type: 'mock', prompt: 'weather_desc' },
              },
            },
          ],
        }),
      ],
    });

    try {
      await labelGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      // With promptLabel
      const res = await labelGateway.fetch(
        'http://localhost/mcp?promptLabel=staging',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {},
          }),
        },
      );
      const body = await res.json();
      expect(body.result.tools[0].description).toBe('Desc with label=staging');
      expect(capturedContexts[0]).toEqual({ label: 'staging' });

      // Without promptLabel context should be undefined
      capturedContexts.length = 0;
      await labelGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });
      expect(capturedContexts[0]).toBeUndefined();
    } finally {
      await labelGateway[Symbol.asyncDispose]?.();
    }
  });

  it('hooks transform tool call results end-to-end', async () => {
    const hooksGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'hooks-gateway',
          tools: [
            {
              name: 'get_weather',
              source: {
                type: 'inline',
                query: `query($location: String!) {
                  weather(location: $location) { temperature conditions }
                }`,
              },
              hooks: {
                postprocess: (result) => {
                  const data = result as {
                    weather: { temperature: number; conditions: string };
                  };
                  return `${data.weather.temperature}F and ${data.weather.conditions}`;
                },
              },
            },
            {
              name: 'gated_weather',
              source: {
                type: 'inline',
                query: `query($location: String!) {
                  weather(location: $location) { temperature }
                }`,
              },
              hooks: {
                preprocess: (args) => {
                  if (!args['_confirmed']) {
                    return {
                      needsConfirmation: true,
                      location: args['location'],
                    };
                  }
                  return undefined;
                },
              },
            },
          ],
        }),
      ],
    });

    try {
      // Load schema
      await hooksGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      // tools/list should omit outputSchema for tools with hooks
      const listRes = await hooksGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          method: 'tools/list',
          params: {},
        }),
      });
      const listBody = await listRes.json();
      for (const tool of listBody.result.tools) {
        expect(tool.outputSchema).toBeUndefined();
      }

      // Test postprocess transforms result
      const postRes = await hooksGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get_weather', arguments: { location: 'New York' } },
        }),
      });
      const postBody = await postRes.json();
      // Postprocess converts to string, so result should be text content (not structuredContent)
      expect(postBody.result.content[0].text).toContain('22');
      expect(postBody.result.content[0].text).toContain('Sunny');
      expect(postBody.result.structuredContent).toBeUndefined();

      // Test preprocess short-circuits
      const preRes = await hooksGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'gated_weather', arguments: { location: 'London' } },
        }),
      });
      const preBody = await preRes.json();
      expect(preBody.result.content[0].text).toContain('needsConfirmation');
      expect(preBody.result.content[0].text).toContain('London');
    } finally {
      await hooksGateway[Symbol.asyncDispose]?.();
    }
  });

  it('auto-registers tools from @mcpTool directive in operations', async () => {
    const directiveGateway = createGatewayRuntime({
      logging: false,
      proxy: {
        endpoint: 'http://upstream:4000/graphql',
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'directive-gateway',
          operationsStr: `
            query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather data", title: "Weather") {
              weather(location: $location) { temperature conditions humidity }
            }
          `,
          tools: [],
        }),
      ],
    });

    try {
      await directiveGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const listRes = await directiveGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      const listBody = await listRes.json();

      expect(listBody.result.tools).toHaveLength(1);
      const tool = listBody.result.tools[0];
      expect(tool.name).toBe('get_weather');
      expect(tool.title).toBe('Weather');
      expect(tool.description).toBe('Get weather data');
      expect(tool.inputSchema.properties.location).toBeDefined();

      const callRes = await directiveGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'get_weather', arguments: { location: 'London' } },
        }),
      });
      const callBody = await callRes.json();
      expect(callBody.result.structuredContent.weather.temperature).toBe(12.5);
    } finally {
      await directiveGateway[Symbol.asyncDispose]?.();
    }
  });

  it('tools/call preserves /mcp path through the Yoga pipeline (not rewritten to graphqlEndpoint)', async () => {
    const capturedUrls: string[] = [];

    const pathGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: () => [
        {
          onRequestParse({ request }: { request: Request }) {
            capturedUrls.push(new URL(request.url).pathname);
          },
        } as any,
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          name: 'path-gateway',
          tools: [
            {
              name: 'get_weather',
              source: {
                type: 'inline',
                query: `query($location: String!) { weather(location: $location) { temperature } }`,
              },
              tool: { description: 'Get weather' },
            },
          ],
        }),
      ],
    });

    try {
      // Trigger schema load
      await pathGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      capturedUrls.length = 0;

      const res = await pathGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get_weather', arguments: { location: 'London' } },
        }),
      });

      const body = await res.json();
      expect(body.result.structuredContent.weather.temperature).toBe(12.5);

      // The request going through onRequestParse should have /mcp, not /graphql
      expect(capturedUrls).toContain('/mcp');
      expect(capturedUrls).not.toContain('/graphql');
    } finally {
      await pathGateway[Symbol.asyncDispose]?.();
    }
  });
});
