import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { createSchema, createYoga } from 'graphql-yoga';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { DescriptionProvider } from '../src/description-provider.js';
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

    expect(body.result.isError).toBeUndefined();
    expect(body.result.content).toHaveLength(1);
    expect(body.result.content[0].type).toBe('text');

    const data = JSON.parse(body.result.content[0].text);
    expect(data.data.weather).toMatchObject({
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

    const data = JSON.parse(body.result.content[0].text);
    expect(data.data.cities[0]).toMatchObject({
      name: 'New York City',
      country: 'US',
      population: 100000,
    });
  });

  it('tools/call returns isError for unknown tool', async () => {
    await graphqlRequest('{ __typename }');

    const res = await mcpRequest('tools/call', {
      name: 'nonexistent_tool',
      arguments: {},
    });
    const body = await res.json();

    expect(body.result.isError).toBe(true);
    const text = JSON.parse(body.result.content[0].text);
    expect(text.error).toContain('Unknown tool');
    expect(text.error).toContain('nonexistent_tool');
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

      expect(body.result.isError).toBeUndefined();
      const data = JSON.parse(body.result.content[0].text);
      expect(data.data.weather).toMatchObject({
        temperature: 12.5,
        conditions: 'Cloudy',
        humidity: 65,
      });
    });
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
      const data = JSON.parse(callBody.result.content[0].text);
      expect(data.data.weather.temperature).toBe(12.5);
    } finally {
      await directiveGateway[Symbol.asyncDispose]?.();
    }
  });
});
