import { describe, expect, it } from 'vitest';
import {
  resolveDescriptions,
  createProviderRegistry,
  type DescriptionProvider,
} from '../src/description-provider.js';
import { resolveToolConfigs } from '../src/plugin.js';

describe('resolveToolConfigs', () => {
  it('returns inline source tools with query extracted', () => {
    const tools = resolveToolConfigs({
      tools: [
        { name: 'test', source: { type: 'inline', query: 'query { hello }' } },
      ],
    });
    expect(tools[0]!.query).toBe('query { hello }');
  });

  it('resolves operations from operationsSource string', () => {
    const operationsSource = `
      query GetWeather($location: String!) {
        getWeatherData(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs({
      tools: [
        {
          name: 'weather',
          source: { type: 'graphql', operationName: 'GetWeather', operationType: 'query' },
        },
      ],
      operationsSource,
    });
    expect(tools[0]!.query).toContain('GetWeather');
  });

  it('throws when operation not found', () => {
    expect(() =>
      resolveToolConfigs({
        tools: [
          {
            name: 'missing',
            source: { type: 'graphql', operationName: 'NotHere', operationType: 'query' },
          },
        ],
        operationsSource: 'query Other { hello }',
      }),
    ).toThrow('NotHere');
  });

  it('preserves tool and input overrides', () => {
    const tools = resolveToolConfigs({
      tools: [
        {
          name: 'test',
          source: { type: 'inline', query: 'query { hello }' },
          tool: { title: 'Hello', description: 'Say hello' },
          input: { schema: { properties: { name: { description: 'Who to greet' } } } },
        },
      ],
    });
    expect(tools[0]!.tool?.title).toBe('Hello');
    expect(tools[0]!.input?.schema?.properties?.['name']?.description).toBe('Who to greet');
  });

  it('auto-registers tools from @mcpTool directives', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather", title: "Weather") {
        weather(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs({ tools: [], operationsSource });
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('get_weather');
    expect(tools[0]!.query).toContain('GetWeather');
    expect(tools[0]!.query).not.toContain('mcpTool');
    expect(tools[0]!.directiveDescription).toBe('Get weather');
    expect(tools[0]!.tool).toEqual({ title: 'Weather' });
  });

  it('config wins over directive on conflict', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Directive desc", title: "Directive Title") {
        weather(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs({
      tools: [
        {
          name: 'get_weather',
          source: { type: 'graphql', operationName: 'GetWeather', operationType: 'query' as const },
          tool: { description: 'Config desc' },
        },
      ],
      operationsSource,
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('get_weather');
    expect(tools[0]!.tool?.description).toBe('Config desc');
    expect(tools[0]!.tool?.title).toBe('Directive Title');
  });

  it('config input overrides apply on top of directive tool', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather") {
        weather(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs({
      tools: [
        {
          name: 'get_weather',
          source: { type: 'graphql', operationName: 'GetWeather', operationType: 'query' as const },
          input: { schema: { properties: { location: { description: 'City name' } } } },
        },
      ],
      operationsSource,
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]!.directiveDescription).toBe('Get weather');
    expect(tools[0]!.input?.schema?.properties?.['location']?.description).toBe('City name');
  });

  it('does not auto-register operations without @mcpTool', () => {
    const operationsSource = `
      query GetWeather($location: String!) {
        weather(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs({ tools: [], operationsSource });
    expect(tools).toHaveLength(0);
  });
});

describe('resolveDescriptions integration', () => {
  const mockProvider: DescriptionProvider = {
    fetchDescription: async (_toolName, config) => `Desc for ${config['prompt']}`,
  };
  const providerRegistry = createProviderRegistry({ mock: mockProvider });

  it('resolves provider descriptions into tool configs', async () => {
    const tools = resolveToolConfigs({
      tools: [
        {
          name: 'test',
          source: { type: 'inline', query: 'query { hello }' },
          tool: { descriptionProvider: { type: 'mock', prompt: 'hello_desc' } },
        },
      ],
    });

    const resolved = await resolveDescriptions(tools, providerRegistry);
    expect(resolved[0]!.providerDescription).toBe('Desc for hello_desc');
  });

  it('does not set providerDescription when tool has no descriptionProvider', async () => {
    const tools = resolveToolConfigs({
      tools: [
        {
          name: 'test',
          source: { type: 'inline', query: 'query { hello }' },
          tool: { description: 'Static' },
        },
      ],
    });

    const resolved = await resolveDescriptions(tools, providerRegistry);
    expect(resolved[0]!.providerDescription).toBeUndefined();
  });
});
