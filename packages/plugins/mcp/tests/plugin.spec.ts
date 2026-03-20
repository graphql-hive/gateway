import { describe, expect, it } from 'vitest';
import {
  createProviderRegistry,
  resolveDescriptions,
  type DescriptionProvider,
} from '../src/description-provider.js';
import { resolveToolConfigs, useMCP } from '../src/plugin.js';

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
          source: {
            type: 'graphql',
            operationName: 'GetWeather',
            operationType: 'query',
          },
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
            source: {
              type: 'graphql',
              operationName: 'NotHere',
              operationType: 'query',
            },
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
          input: {
            schema: { properties: { name: { description: 'Who to greet' } } },
          },
        },
      ],
    });
    expect(tools[0]!.tool?.title).toBe('Hello');
    expect(tools[0]!.input?.schema?.properties?.['name']?.description).toBe(
      'Who to greet',
    );
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
          source: {
            type: 'graphql',
            operationName: 'GetWeather',
            operationType: 'query' as const,
          },
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
          source: {
            type: 'graphql',
            operationName: 'GetWeather',
            operationType: 'query' as const,
          },
          input: {
            schema: { properties: { location: { description: 'City name' } } },
          },
        },
      ],
      operationsSource,
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]!.directiveDescription).toBe('Get weather');
    expect(tools[0]!.input?.schema?.properties?.['location']?.description).toBe(
      'City name',
    );
  });

  it('preserves hooks through resolveToolConfigs', () => {
    const hooks = { preprocess: () => undefined };
    const tools = resolveToolConfigs({
      tools: [
        {
          name: 'test',
          source: { type: 'inline', query: 'query { hello }' },
          hooks,
        },
      ],
    });
    expect(tools[0]!.hooks).toBe(hooks);
  });

  it('parses descriptionProvider from @mcpTool directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:weather_prompt") {
        weather(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs({ tools: [], operationsSource });
    expect(tools).toHaveLength(1);
    expect(tools[0]!.tool?.descriptionProvider).toEqual({
      type: 'langfuse',
      prompt: 'weather_prompt',
    });
  });

  it('parses descriptionProvider with version from @mcpTool directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:weather_prompt:3") {
        weather(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs({ tools: [], operationsSource });
    expect(tools[0]!.tool?.descriptionProvider).toEqual({
      type: 'langfuse',
      prompt: 'weather_prompt',
      version: 3,
    });
  });

  it('throws on invalid descriptionProvider format in directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "invalid") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() => resolveToolConfigs({ tools: [], operationsSource })).toThrow(
      'Invalid descriptionProvider directive format',
    );
  });

  it('throws on invalid version in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:prompt:abc") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() => resolveToolConfigs({ tools: [], operationsSource })).toThrow(
      'Invalid version',
    );
  });

  it('throws on version 0 in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:prompt:0") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() => resolveToolConfigs({ tools: [], operationsSource })).toThrow(
      'Version must be a positive integer',
    );
  });

  it('throws on negative version in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:prompt:-1") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() => resolveToolConfigs({ tools: [], operationsSource })).toThrow(
      'Version must be a positive integer',
    );
  });

  it('throws on trailing colon in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:prompt:") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() => resolveToolConfigs({ tools: [], operationsSource })).toThrow(
      'Trailing colon with no version',
    );
  });

  it('throws on extra segments in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:prompt:3:extra") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() => resolveToolConfigs({ tools: [], operationsSource })).toThrow(
      'Invalid descriptionProvider directive format',
    );
  });

  it('throws on empty type in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: ":prompt") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() => resolveToolConfigs({ tools: [], operationsSource })).toThrow(
      'Invalid descriptionProvider directive format',
    );
  });

  it('throws on empty prompt in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() => resolveToolConfigs({ tools: [], operationsSource })).toThrow(
      'Invalid descriptionProvider directive format',
    );
  });

  it('config descriptionProvider wins over directive descriptionProvider', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:directive_prompt") {
        weather(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs({
      tools: [
        {
          name: 'get_weather',
          source: {
            type: 'graphql',
            operationName: 'GetWeather',
            operationType: 'query' as const,
          },
          tool: {
            descriptionProvider: {
              type: 'langfuse',
              prompt: 'config_prompt',
            },
          },
        },
      ],
      operationsSource,
    });
    expect(tools[0]!.tool?.descriptionProvider).toEqual({
      type: 'langfuse',
      prompt: 'config_prompt',
    });
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

describe('useMCP startup validation', () => {
  it('throws when field-level descriptionProvider references unknown provider', () => {
    expect(() =>
      useMCP({
        name: 'test',
        tools: [
          {
            name: 'search',
            source: {
              type: 'inline',
              query: 'query($q: String!) { search(q: $q) }',
            },
            input: {
              schema: {
                properties: {
                  q: {
                    descriptionProvider: {
                      type: 'nonexistent',
                      prompt: 'test',
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    ).toThrow(
      'Unknown description provider type: "nonexistent" for tool "search" field "q"',
    );
  });
});

describe('resolveDescriptions integration', () => {
  const mockProvider: DescriptionProvider = {
    fetchDescription: async (_toolName, config) =>
      `Desc for ${config['prompt']}`,
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
