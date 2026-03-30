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

          """
          Get weather forecast for upcoming days
          """
          forecast(location: String!, days: Int = 3): [ForecastDay!]!
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

        type ForecastDay {
          date: String
          high: Float
          low: Float
          conditions: String
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
          forecast: (_root, { location, days = 3 }) =>
            Array.from({ length: days }, (_, i) => ({
              date: `2026-01-0${i + 1}`,
              high: location === 'London' ? 10 + i : 25 + i,
              low: location === 'London' ? 5 + i : 18 + i,
              conditions: i % 2 === 0 ? 'Sunny' : 'Cloudy',
            })),
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
    plugins: (ctx) => [
      useCustomFetch(
        // @ts-expect-error MeshFetch type mismatch
        (url, init) => upstream.fetch(url, init),
      ),
      useMCP({
        ...ctx,
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
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
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
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
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
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
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
      plugins: (ctx) => [
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
          ...ctx,
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
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
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
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
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
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
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
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
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
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
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
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
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
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
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
      plugins: (ctx) => [
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
          ...ctx,
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

  describe('resources', () => {
    const resourceGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
          name: 'resource-gateway',
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
          resources: [
            {
              name: 'agent-guide',
              uri: 'docs://agent-guide',
              title: 'Agent Guide',
              description: 'How agents work',
              mimeType: 'text/markdown',
              text: '# Agent Guide\n\nAgents route requests based on intent.',
              annotations: { audience: ['assistant'], priority: 0.9 },
            },
            {
              name: 'api-reference',
              uri: 'docs://api-reference',
              text: 'GET /health - Health check endpoint',
            },
            {
              name: 'icon',
              uri: 'files://icon.png',
              mimeType: 'image/png',
              blob: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
            },
          ],
        }),
      ],
    });

    afterAll(() => resourceGateway[Symbol.asyncDispose]?.());

    function resourceMcpRequest(method: string, params: unknown = {}, id = 1) {
      return resourceGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
    }

    it('initialize advertises resources capability', async () => {
      const res = await resourceMcpRequest('initialize');
      const body = await res.json();
      expect(body.result.capabilities.resources).toEqual({});
      expect(body.result.capabilities.tools).toBeDefined();
    });

    it('resources/list returns configured resources', async () => {
      // Trigger schema load
      await resourceGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const res = await resourceMcpRequest('resources/list');
      const body = await res.json();
      expect(body.result.resources).toHaveLength(3);

      const guide = body.result.resources.find(
        (r: any) => r.uri === 'docs://agent-guide',
      );
      expect(guide).toMatchObject({
        name: 'agent-guide',
        title: 'Agent Guide',
        description: 'How agents work',
        mimeType: 'text/markdown',
        annotations: { audience: ['assistant'], priority: 0.9 },
      });
    });

    it('resources/read returns content by URI', async () => {
      const res = await resourceMcpRequest('resources/read', {
        uri: 'docs://agent-guide',
      });
      const body = await res.json();
      expect(body.result.contents).toEqual([
        {
          uri: 'docs://agent-guide',
          mimeType: 'text/markdown',
          text: '# Agent Guide\n\nAgents route requests based on intent.',
        },
      ]);
    });

    it('resources/read returns blob for binary resources', async () => {
      const res = await resourceMcpRequest('resources/read', {
        uri: 'files://icon.png',
      });
      const body = await res.json();
      expect(body.result.contents).toEqual([
        {
          uri: 'files://icon.png',
          mimeType: 'image/png',
          blob: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
        },
      ]);
    });

    it('resources/read returns error for unknown URI', async () => {
      const res = await resourceMcpRequest('resources/read', {
        uri: 'docs://nonexistent',
      });
      const body = await res.json();
      expect(body.error.code).toBe(-32002);
      expect(body.error.message).toBe('Resource not found');
    });

    it('tools still work alongside resources', async () => {
      const res = await resourceMcpRequest('tools/call', {
        name: 'get_weather',
        arguments: { location: 'London' },
      });
      const body = await res.json();
      expect(body.result.structuredContent.weather.temperature).toBe(12.5);
    });
  });

  describe('resource templates', () => {
    const templateGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
          name: 'template-gateway',
          tools: [],
          resourceTemplates: [
            {
              uriTemplate: 'weather://{location}',
              name: 'Weather Data',
              title: 'Weather by Location',
              description: 'Get weather data as a resource',
              mimeType: 'application/json',
              handler: async (params) => ({
                text: JSON.stringify({
                  location: params['location'],
                  temperature: 72,
                }),
              }),
            },
          ],
        }),
      ],
    });

    afterAll(() => templateGateway[Symbol.asyncDispose]?.());

    function tmplRequest(method: string, params: unknown = {}, id = 1) {
      return templateGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
    }

    it('initialize advertises resources capability for templates-only', async () => {
      const res = await tmplRequest('initialize');
      const body = await res.json();
      expect(body.result.capabilities.resources).toEqual({});
    });

    it('resources/templates/list returns templates', async () => {
      const res = await tmplRequest('resources/templates/list');
      const body = await res.json();
      expect(body.result.resourceTemplates).toHaveLength(1);
      expect(body.result.resourceTemplates[0]).toMatchObject({
        uriTemplate: 'weather://{location}',
        name: 'Weather Data',
        title: 'Weather by Location',
      });
    });

    it('resources/read resolves template and calls handler', async () => {
      const res = await tmplRequest('resources/read', {
        uri: 'weather://London',
      });
      const body = await res.json();
      expect(body.result.contents[0].mimeType).toBe('application/json');
      const data = JSON.parse(body.result.contents[0].text);
      expect(data.location).toBe('London');
      expect(data.temperature).toBe(72);
    });

    it('resources/read returns not found for non-matching URI', async () => {
      const res = await tmplRequest('resources/read', {
        uri: 'other://something',
      });
      const body = await res.json();
      expect(body.error.code).toBe(-32002);
    });
  });

  describe('@mcpDescription directive via operationsPath', () => {
    const fileMockProvider: DescriptionProvider = {
      fetchDescription: vi.fn(async (_name, config) => {
        return `Resolved: ${config['prompt']}`;
      }),
    };

    const fileGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
          name: 'file-desc-gateway',
          operationsPath: require('node:path').resolve(
            __dirname,
            '../../../../examples/mcp-example/operations/weather_directive.graphql',
          ),
          tools: [],
          providers: { langfuse: fileMockProvider as any },
        }),
      ],
    });

    afterAll(() => fileGateway[Symbol.asyncDispose]?.());

    function fileRequest(
      method: string,
      params: unknown = {},
      id: number | string = 1,
    ) {
      return fileGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
    }

    it('registers @mcpTool operations from file and resolves @mcpDescription', async () => {
      await fileGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const res = await fileRequest('tools/list');
      const body = await res.json();
      const tools = body.result.tools;
      const toolNames = tools.map((t: any) => t.name).sort();

      // Should register all @mcpTool operations from the file
      expect(toolNames).toContain('quick_weather');
      expect(toolNames).toContain('weather_field_provider');
    });

    it('@mcpDescription on variable resolves description from provider (langfuse mock)', async () => {
      await fileGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const res = await fileRequest('tools/list');
      const body = await res.json();
      const tool = body.result.tools.find(
        (t: any) => t.name === 'weather_field_provider',
      );

      expect(tool).toBeDefined();
      // $location @mcpDescription(provider: "langfuse:weather.location:3")
      expect(tool.inputSchema.properties.location.description).toBe(
        'Resolved: weather.location',
      );
    });

    it('@mcpDescription on selection field resolves description from provider', async () => {
      await fileGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const res = await fileRequest('tools/list');
      const body = await res.json();
      const tool = body.result.tools.find(
        (t: any) => t.name === 'weather_field_provider',
      );

      expect(tool).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
      // conditions @mcpDescription(provider: "langfuse:forecast.conditions")
      expect(
        tool.outputSchema.properties.forecast.items.properties.conditions
          .description,
      ).toBe('Resolved: forecast.conditions');
    });

    it('tools/call works with @mcpDescription directives stripped', async () => {
      await fileGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const res = await fileRequest('tools/call', {
        name: 'weather_field_provider',
        arguments: { location: 'London', days: 3 },
      });
      const body = await res.json();
      expect(body.result.isError).toBeFalsy();
      // Should return forecast data
      expect(body.result.content[0].text).toBeDefined();
    });
  });

  describe('@mcpDescription directive', () => {
    const descMockProvider: DescriptionProvider = {
      fetchDescription: vi.fn(async (_name, config) => {
        return `Desc: ${config['prompt']}`;
      }),
    };

    const descGateway = createGatewayRuntime({
      logging: false,
      proxy: { endpoint: 'http://upstream:4000/graphql' },
      plugins: (ctx) => [
        useCustomFetch(
          // @ts-expect-error MeshFetch type mismatch
          (url: string, init: RequestInit) => upstream.fetch(url, init),
        ),
        useMCP({
          ...ctx,
          name: 'desc-directive-gateway',
          operationsStr: `
            query GetWeather(
              $location: String! @mcpDescription(provider: "mock:weather.location")
            ) @mcpTool(name: "get_weather", description: "Get weather") {
              weather(location: $location) {
                temperature
                conditions @mcpDescription(provider: "mock:weather.conditions")
                humidity
              }
            }
          `,
          tools: [],
          providers: { mock: descMockProvider },
        }),
      ],
    });

    afterAll(() => descGateway[Symbol.asyncDispose]?.());

    function descRequest(
      method: string,
      params: unknown = {},
      id: number | string = 1,
    ) {
      return descGateway.fetch('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
    }

    it('@mcpDescription on variable populates input field description via provider', async () => {
      await descGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const res = await descRequest('tools/list');
      const body = await res.json();
      const tool = body.result.tools.find((t: any) => t.name === 'get_weather');

      expect(tool).toBeDefined();
      // Variable @mcpDescription should resolve to provider description
      expect(tool.inputSchema.properties.location.description).toBe(
        'Desc: weather.location',
      );
    });

    it('@mcpDescription on selection field populates output field description via provider', async () => {
      await descGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const res = await descRequest('tools/list');
      const body = await res.json();
      const tool = body.result.tools.find((t: any) => t.name === 'get_weather');

      expect(tool).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
      // Selection @mcpDescription should resolve conditions field description
      expect(
        tool.outputSchema.properties.weather.properties.conditions.description,
      ).toBe('Desc: weather.conditions');
    });

    it('@mcpDescription directives are stripped from the executed query', async () => {
      await descGateway.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      const res = await descRequest('tools/call', {
        name: 'get_weather',
        arguments: { location: 'London' },
      });
      const body = await res.json();
      expect(body.result.isError).toBeFalsy();
      expect(body.result.content[0].text).toContain('12.5'); // London temperature
    });
  });
});
