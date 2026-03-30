import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLoggerFromLogging } from '@graphql-hive/gateway-runtime';
import { describe, expect, it } from 'vitest';
import {
  createProviderRegistry,
  resolveDescriptions,
  type DescriptionProvider,
} from '../src/description-provider.js';
import {
  compileUriTemplate,
  resolveResources,
  resolveResourceTemplates,
  resolveToolConfigs,
  useMCP,
} from '../src/plugin.js';

const logger = createLoggerFromLogging(false);

describe('resolveToolConfigs', () => {
  it('returns inline source tools with query extracted', () => {
    const tools = resolveToolConfigs(
      {
        tools: [
          {
            name: 'test',
            source: { type: 'inline', query: 'query { hello }' },
          },
        ],
      },
      logger,
    );
    expect(tools[0]!.query).toBe('query { hello }');
  });

  it('resolves operations from operationsSource string', () => {
    const operationsSource = `
      query GetWeather($location: String!) {
        getWeatherData(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs(
      {
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
      },
      logger,
    );
    expect(tools[0]!.query).toContain('GetWeather');
  });

  it('throws when operation not found', () => {
    expect(() =>
      resolveToolConfigs(
        {
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
        },
        logger,
      ),
    ).toThrow('NotHere');
  });

  it('preserves tool and input overrides', () => {
    const tools = resolveToolConfigs(
      {
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
      },
      logger,
    );
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
    const tools = resolveToolConfigs({ tools: [], operationsSource }, logger);
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
    const tools = resolveToolConfigs(
      {
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
      },
      logger,
    );
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
    const tools = resolveToolConfigs(
      {
        tools: [
          {
            name: 'get_weather',
            source: {
              type: 'graphql',
              operationName: 'GetWeather',
              operationType: 'query' as const,
            },
            input: {
              schema: {
                properties: { location: { description: 'City name' } },
              },
            },
          },
        ],
        operationsSource,
      },
      logger,
    );
    expect(tools).toHaveLength(1);
    expect(tools[0]!.directiveDescription).toBe('Get weather');
    expect(tools[0]!.input?.schema?.properties?.['location']?.description).toBe(
      'City name',
    );
  });

  it('preserves hooks through resolveToolConfigs', () => {
    const hooks = { preprocess: () => undefined };
    const tools = resolveToolConfigs(
      {
        tools: [
          {
            name: 'test',
            source: { type: 'inline', query: 'query { hello }' },
            hooks,
          },
        ],
      },
      logger,
    );
    expect(tools[0]!.hooks).toBe(hooks);
  });

  it('parses descriptionProvider from @mcpTool directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:weather_prompt") {
        weather(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs({ tools: [], operationsSource }, logger);
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
    const tools = resolveToolConfigs({ tools: [], operationsSource }, logger);
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
    expect(() =>
      resolveToolConfigs({ tools: [], operationsSource }, logger),
    ).toThrow('Invalid descriptionProvider directive format');
  });

  it('throws on invalid version in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:prompt:abc") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() =>
      resolveToolConfigs({ tools: [], operationsSource }, logger),
    ).toThrow('Invalid version');
  });

  it('throws on version 0 in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:prompt:0") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() =>
      resolveToolConfigs({ tools: [], operationsSource }, logger),
    ).toThrow('Version must be a positive integer');
  });

  it('throws on negative version in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:prompt:-1") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() =>
      resolveToolConfigs({ tools: [], operationsSource }, logger),
    ).toThrow('Version must be a positive integer');
  });

  it('throws on trailing colon in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:prompt:") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() =>
      resolveToolConfigs({ tools: [], operationsSource }, logger),
    ).toThrow('Trailing colon with no version');
  });

  it('throws on extra segments in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:prompt:3:extra") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() =>
      resolveToolConfigs({ tools: [], operationsSource }, logger),
    ).toThrow('Invalid descriptionProvider directive format');
  });

  it('throws on empty type in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: ":prompt") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() =>
      resolveToolConfigs({ tools: [], operationsSource }, logger),
    ).toThrow('Invalid descriptionProvider directive format');
  });

  it('throws on empty prompt in descriptionProvider directive', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:") {
        weather(location: $location) { temperature }
      }
    `;
    expect(() =>
      resolveToolConfigs({ tools: [], operationsSource }, logger),
    ).toThrow('Invalid descriptionProvider directive format');
  });

  it('config descriptionProvider wins over directive descriptionProvider', () => {
    const operationsSource = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:directive_prompt") {
        weather(location: $location) { temperature }
      }
    `;
    const tools = resolveToolConfigs(
      {
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
      },
      logger,
    );
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
    const tools = resolveToolConfigs({ tools: [], operationsSource }, logger);
    expect(tools).toHaveLength(0);
  });
});

describe('resolveResources', () => {
  it('resolves inline text resource', () => {
    const resources = resolveResources(
      [{ name: 'guide', uri: 'docs://guide', text: '# Guide\nHello' }],
      createLoggerFromLogging(false),
    );
    expect(resources.size).toBe(1);
    const r = resources.get('docs://guide')!;
    expect(r.name).toBe('guide');
    expect(r.text).toBe('# Guide\nHello');
    expect(r.mimeType).toBe('text/plain');
    expect(r.size).toBe(Buffer.byteLength('# Guide\nHello'));
  });

  it('defaults mimeType to text/plain', () => {
    const resources = resolveResources(
      [{ name: 'r', uri: 'test://r', text: 'hi' }],
      createLoggerFromLogging(false),
    );
    expect(resources.get('test://r')!.mimeType).toBe('text/plain');
  });

  it('preserves explicit mimeType', () => {
    const resources = resolveResources(
      [{ name: 'r', uri: 'test://r', text: '# hi', mimeType: 'text/markdown' }],
      createLoggerFromLogging(false),
    );
    expect(resources.get('test://r')!.mimeType).toBe('text/markdown');
  });

  it('preserves optional fields (title, description, icons, annotations)', () => {
    const resources = resolveResources(
      [
        {
          name: 'r',
          uri: 'test://r',
          text: 'content',
          title: 'My Resource',
          description: 'A resource',
          icons: [{ src: 'https://example.com/icon.png' }],
          annotations: { audience: ['assistant'] as const, priority: 0.8 },
        },
      ],
      createLoggerFromLogging(false),
    );
    const r = resources.get('test://r')!;
    expect(r.title).toBe('My Resource');
    expect(r.description).toBe('A resource');
    expect(r.icons).toEqual([{ src: 'https://example.com/icon.png' }]);
    expect(r.annotations).toEqual({ audience: ['assistant'], priority: 0.8 });
  });

  it('throws if both text and file are provided', () => {
    expect(() =>
      resolveResources(
        [
          // Cast to simulate invalid JSON/YAML config that bypasses TS discriminated union
          { name: 'r', uri: 'test://r', text: 'hi', file: './foo.md' } as any,
        ],
        createLoggerFromLogging(false),
      ),
    ).toThrow('specify exactly one of');
  });

  it('throws if no content source is provided', () => {
    expect(() =>
      resolveResources(
        [{ name: 'r', uri: 'test://r' } as any],
        createLoggerFromLogging(false),
      ),
    ).toThrow('must specify either');
  });

  it('throws on duplicate URIs', () => {
    expect(() =>
      resolveResources(
        [
          { name: 'a', uri: 'test://dup', text: 'a' },
          { name: 'b', uri: 'test://dup', text: 'b' },
        ],
        createLoggerFromLogging(false),
      ),
    ).toThrow('Duplicate resource URI');
  });

  it('resolves file-based resource', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-test-'));
    const filePath = join(dir, 'guide.md');
    writeFileSync(filePath, '# Guide from file');
    const resources = resolveResources(
      [{ name: 'guide', uri: 'docs://guide', file: filePath }],
      createLoggerFromLogging(false),
    );
    const r = resources.get('docs://guide')!;
    expect(r.text).toBe('# Guide from file');
    expect(r.size).toBe(Buffer.byteLength('# Guide from file'));
    expect(r.mimeType).toBe('text/plain');
  });

  it('throws with context when file does not exist', () => {
    expect(() =>
      resolveResources(
        [
          {
            name: 'missing',
            uri: 'docs://missing',
            file: '/nonexistent/path.md',
          },
        ],
        createLoggerFromLogging(false),
      ),
    ).toThrow(/Resource "missing" .* cannot read file/);
  });

  it('resolves inline blob resource', () => {
    const b64 = Buffer.from('binary data').toString('base64');
    const resources = resolveResources(
      [
        {
          name: 'img',
          uri: 'files://icon.png',
          blob: b64,
          mimeType: 'image/png',
        },
      ],
      createLoggerFromLogging(false),
    );
    const r = resources.get('files://icon.png')!;
    expect(r.blob).toBe(b64);
    expect(r.text).toBeUndefined();
    expect(r.size).toBe(Buffer.byteLength('binary data'));
    expect(r.mimeType).toBe('image/png');
  });

  it('reads binary file when mimeType is not text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-test-'));
    const filePath = join(dir, 'icon.png');
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    writeFileSync(filePath, buf);
    const resources = resolveResources(
      [
        {
          name: 'icon',
          uri: 'files://icon',
          file: filePath,
          mimeType: 'image/png',
        },
      ],
      createLoggerFromLogging(false),
    );
    const r = resources.get('files://icon')!;
    expect(r.blob).toBe(buf.toString('base64'));
    expect(r.text).toBeUndefined();
    expect(r.size).toBe(4);
  });

  it('reads file as text when mimeType is text/*', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-test-'));
    const filePath = join(dir, 'data.json');
    writeFileSync(filePath, '{"key": "value"}');
    const resources = resolveResources(
      [
        {
          name: 'data',
          uri: 'files://data',
          file: filePath,
          mimeType: 'application/json',
        },
      ],
      createLoggerFromLogging(false),
    );
    const r = resources.get('files://data')!;
    expect(r.text).toBe('{"key": "value"}');
    expect(r.blob).toBeUndefined();
  });

  it('binary flag overrides mimeType detection', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-test-'));
    const filePath = join(dir, 'special.txt');
    const buf = Buffer.from([0x00, 0x01, 0x02]);
    writeFileSync(filePath, buf);
    const resources = resolveResources(
      [
        {
          name: 'special',
          uri: 'files://special',
          file: filePath,
          mimeType: 'text/plain',
          binary: true,
        },
      ],
      createLoggerFromLogging(false),
    );
    const r = resources.get('files://special')!;
    expect(r.blob).toBe(buf.toString('base64'));
    expect(r.text).toBeUndefined();
  });

  it('throws if multiple content sources are provided', () => {
    expect(() =>
      resolveResources(
        [{ name: 'r', uri: 'test://r', text: 'hi', blob: 'aGk=' } as any],
        createLoggerFromLogging(false),
      ),
    ).toThrow('specify exactly one of');
  });
});

describe('compileUriTemplate', () => {
  it('compiles simple single-param template', () => {
    const { pattern, paramNames } = compileUriTemplate('docs://schemas/{name}');
    expect(paramNames).toEqual(['name']);
    const match = pattern.exec('docs://schemas/users');
    expect(match?.groups?.['name']).toBe('users');
  });

  it('compiles multi-param template', () => {
    const { pattern, paramNames } = compileUriTemplate(
      'files://{org}/{repo}/{path}',
    );
    expect(paramNames).toEqual(['org', 'repo', 'path']);
    const match = pattern.exec('files://acme/gateway/README.md');
    expect(match?.groups?.['org']).toBe('acme');
    expect(match?.groups?.['repo']).toBe('gateway');
    expect(match?.groups?.['path']).toBe('README.md');
  });

  it('does not match wrong prefix', () => {
    const { pattern } = compileUriTemplate('docs://schemas/{name}');
    expect(pattern.exec('other://schemas/users')).toBeNull();
  });

  it('does not match extra path segments', () => {
    const { pattern } = compileUriTemplate('docs://schemas/{name}');
    expect(pattern.exec('docs://schemas/users/extra')).toBeNull();
  });

  it('escapes special regex characters in literal parts', () => {
    const { pattern } = compileUriTemplate('docs://api.v2/{name}');
    expect(pattern.exec('docs://api.v2/users')).not.toBeNull();
    expect(pattern.exec('docs://apiXv2/users')).toBeNull();
  });

  it('throws on invalid parameter names', () => {
    expect(() => compileUriTemplate('docs://{my-param}')).toThrow(
      'Invalid parameter name',
    );
    expect(() => compileUriTemplate('docs://{123}')).toThrow(
      'Invalid parameter name',
    );
    expect(() => compileUriTemplate('docs://{a b}')).toThrow(
      'Invalid parameter name',
    );
  });

  it('throws on duplicate parameter names', () => {
    expect(() => compileUriTemplate('docs://{name}/sub/{name}')).toThrow(
      'Duplicate parameter name',
    );
  });

  it('allows valid identifier-style parameter names', () => {
    expect(() => compileUriTemplate('docs://{name}')).not.toThrow();
    expect(() => compileUriTemplate('docs://{_private}')).not.toThrow();
    expect(() => compileUriTemplate('docs://{$var}')).not.toThrow();
    expect(() => compileUriTemplate('docs://{camelCase123}')).not.toThrow();
  });
});

describe('resolveResourceTemplates', () => {
  it('compiles templates with patterns', () => {
    const handler = () => ({ text: 'hi' });
    const templates = resolveResourceTemplates([
      { uriTemplate: 'docs://{name}', name: 'doc', handler },
    ]);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.paramNames).toEqual(['name']);
    expect(templates[0]!.pattern.test('docs://test')).toBe(true);
    expect(templates[0]!.handler).toBe(handler);
  });
});

const testCtx = { log: createLoggerFromLogging(false) };

describe('useMCP startup validation', () => {
  it('throws when field-level descriptionProvider references unknown provider', () => {
    expect(() =>
      useMCP(testCtx, {
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

  it('throws when resource descriptionProvider references unknown provider', () => {
    expect(() =>
      useMCP(testCtx, {
        name: 'test',
        tools: [],
        resources: [
          {
            name: 'guide',
            uri: 'docs://guide',
            text: 'content',
            descriptionProvider: { type: 'nonexistent', prompt: 'test' },
          },
        ],
      }),
    ).toThrow(
      'Unknown description provider type: "nonexistent" for resource "guide"',
    );
  });

  it('throws when output field descriptionProvider references unknown provider', () => {
    const source = `
      query GetForecast($location: String!) @mcpTool(name: "forecast") {
        forecast(location: $location) {
          conditions @mcpDescription(provider: "nonexistent:forecast.conditions")
        }
      }
    `;
    expect(() =>
      useMCP(testCtx, {
        name: 'test',
        tools: [],
        operationsStr: source,
      }),
    ).toThrow(
      'Unknown description provider type: "nonexistent" for tool "forecast" output field "forecast.conditions"',
    );
  });

  it('throws when resource template descriptionProvider references unknown provider', () => {
    expect(() =>
      useMCP(testCtx, {
        name: 'test',
        tools: [],
        resourceTemplates: [
          {
            uriTemplate: 'docs://{name}',
            name: 'doc',
            descriptionProvider: { type: 'nonexistent', prompt: 'test' },
            handler: () => ({ text: 'hi' }),
          },
        ],
      }),
    ).toThrow(
      'Unknown description provider type: "nonexistent" for resource template "doc"',
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
    const tools = resolveToolConfigs(
      {
        tools: [
          {
            name: 'test',
            source: { type: 'inline', query: 'query { hello }' },
            tool: {
              descriptionProvider: { type: 'mock', prompt: 'hello_desc' },
            },
          },
        ],
      },
      logger,
    );

    const resolved = await resolveDescriptions(
      tools,
      providerRegistry,
      { isStartup: false },
      logger,
    );
    expect(resolved[0]!.providerDescription).toBe('Desc for hello_desc');
  });

  it('does not set providerDescription when tool has no descriptionProvider', async () => {
    const tools = resolveToolConfigs(
      {
        tools: [
          {
            name: 'test',
            source: { type: 'inline', query: 'query { hello }' },
            tool: { description: 'Static' },
          },
        ],
      },
      logger,
    );

    const resolved = await resolveDescriptions(
      tools,
      providerRegistry,
      { isStartup: false },
      logger,
    );
    expect(resolved[0]!.providerDescription).toBeUndefined();
  });
});

describe('@mcpDescription directive on variables', () => {
  it('populates input.schema.properties with descriptionProvider from @mcpDescription', () => {
    const source = `
      query Search($q: String! @mcpDescription(provider: "langfuse:search.query:3")) @mcpTool(name: "search") {
        search(q: $q) { title }
      }
    `;
    const tools = resolveToolConfigs(
      { tools: [], operationsSource: source },
      logger,
    );

    expect(tools).toHaveLength(1);
    expect(tools[0]!.input?.schema?.properties?.['q']).toEqual({
      descriptionProvider: {
        type: 'langfuse',
        prompt: 'search.query',
        version: 3,
      },
    });
  });

  it('handles multiple @mcpDescription directives on different variables', () => {
    const source = `
      query Search(
        $q: String! @mcpDescription(provider: "langfuse:search.query")
        $limit: Int
        $offset: Int @mcpDescription(provider: "langfuse:search.offset:2")
      ) @mcpTool(name: "search") {
        search(q: $q, limit: $limit, offset: $offset) { title }
      }
    `;
    const tools = resolveToolConfigs(
      { tools: [], operationsSource: source },
      logger,
    );

    expect(tools[0]!.input?.schema?.properties?.['q']).toEqual({
      descriptionProvider: { type: 'langfuse', prompt: 'search.query' },
    });
    expect(tools[0]!.input?.schema?.properties?.['offset']).toEqual({
      descriptionProvider: {
        type: 'langfuse',
        prompt: 'search.offset',
        version: 2,
      },
    });
    expect(tools[0]!.input?.schema?.properties?.['limit']).toBeUndefined();
  });

  it('config input overrides directive input', () => {
    const source = `
      query Search($q: String! @mcpDescription(provider: "langfuse:from_directive")) @mcpTool(name: "search") {
        search(q: $q) { title }
      }
    `;
    const tools = resolveToolConfigs(
      {
        tools: [
          {
            name: 'search',
            source: {
              type: 'graphql',
              operationName: 'Search',
              operationType: 'query' as const,
            },
            input: {
              schema: {
                properties: {
                  q: {
                    descriptionProvider: {
                      type: 'langfuse',
                      prompt: 'from_config',
                    },
                  },
                },
              },
            },
          },
        ],
        operationsSource: source,
      },
      logger,
    );

    expect(
      tools[0]!.input?.schema?.properties?.['q']?.descriptionProvider,
    ).toEqual({
      type: 'langfuse',
      prompt: 'from_config',
    });
  });

  it('preserves directive input when config has no input', () => {
    const source = `
      query Search($q: String! @mcpDescription(provider: "langfuse:search.query")) @mcpTool(name: "search") {
        search(q: $q) { title }
      }
    `;
    const tools = resolveToolConfigs(
      {
        tools: [
          {
            name: 'search',
            source: {
              type: 'graphql',
              operationName: 'Search',
              operationType: 'query' as const,
            },
            tool: { description: 'Config description' },
          },
        ],
        operationsSource: source,
      },
      logger,
    );

    expect(
      tools[0]!.input?.schema?.properties?.['q']?.descriptionProvider,
    ).toEqual({
      type: 'langfuse',
      prompt: 'search.query',
    });
  });

  it('does not populate input when no @mcpDescription is present', () => {
    const source = `
      query Search($q: String!) @mcpTool(name: "search") {
        search(q: $q) { title }
      }
    `;
    const tools = resolveToolConfigs(
      { tools: [], operationsSource: source },
      logger,
    );
    expect(tools[0]!.input).toBeUndefined();
  });
});

describe('@mcpDescription directive on selection fields', () => {
  it('populates output.descriptionProviders from @mcpDescription on selection fields', () => {
    const source = `
      query GetForecast($location: String!) @mcpTool(name: "forecast") {
        forecast(location: $location) {
          date
          conditions @mcpDescription(provider: "langfuse:forecast.conditions:3")
        }
      }
    `;
    const tools = resolveToolConfigs(
      { tools: [], operationsSource: source },
      logger,
    );

    expect(tools).toHaveLength(1);
    expect(tools[0]!.output?.descriptionProviders).toEqual({
      'forecast.conditions': {
        type: 'langfuse',
        prompt: 'forecast.conditions',
        version: 3,
      },
    });
  });

  it('handles nested selection field providers', () => {
    const source = `
      query GetUser @mcpTool(name: "get_user") {
        user {
          profile {
            bio @mcpDescription(provider: "langfuse:user.profile.bio")
          }
        }
      }
    `;
    const tools = resolveToolConfigs(
      { tools: [], operationsSource: source },
      logger,
    );

    expect(tools[0]!.output?.descriptionProviders).toEqual({
      'user.profile.bio': { type: 'langfuse', prompt: 'user.profile.bio' },
    });
  });

  it('config output overrides directive output', () => {
    const source = `
      query GetForecast($location: String!) @mcpTool(name: "forecast") {
        forecast(location: $location) {
          conditions @mcpDescription(provider: "langfuse:from_directive")
        }
      }
    `;
    const tools = resolveToolConfigs(
      {
        tools: [
          {
            name: 'forecast',
            source: {
              type: 'graphql',
              operationName: 'GetForecast',
              operationType: 'query' as const,
            },
            output: { path: 'forecast' },
          },
        ],
        operationsSource: source,
      },
      logger,
    );

    expect(tools[0]!.output?.path).toBe('forecast');
    expect(tools[0]!.output?.descriptionProviders).toBeUndefined();
  });

  it('preserves directive output when config has no output', () => {
    const source = `
      query GetForecast($location: String!) @mcpTool(name: "forecast") {
        forecast(location: $location) {
          conditions @mcpDescription(provider: "langfuse:forecast.conditions")
        }
      }
    `;
    const tools = resolveToolConfigs(
      {
        tools: [
          {
            name: 'forecast',
            source: {
              type: 'graphql',
              operationName: 'GetForecast',
              operationType: 'query' as const,
            },
          },
        ],
        operationsSource: source,
      },
      logger,
    );

    expect(tools[0]!.output?.descriptionProviders).toEqual({
      'forecast.conditions': {
        type: 'langfuse',
        prompt: 'forecast.conditions',
      },
    });
  });

  it('does not populate output when no @mcpDescription in selection set', () => {
    const source = `
      query GetForecast($location: String!) @mcpTool(name: "forecast") {
        forecast(location: $location) { date conditions }
      }
    `;
    const tools = resolveToolConfigs(
      { tools: [], operationsSource: source },
      logger,
    );
    expect(tools[0]!.output).toBeUndefined();
  });

  it('combines input and output @mcpDescription directives', () => {
    const source = `
      query Search(
        $q: String! @mcpDescription(provider: "langfuse:search.query")
      ) @mcpTool(name: "search") {
        results(q: $q) {
          title @mcpDescription(provider: "langfuse:search.title")
        }
      }
    `;
    const tools = resolveToolConfigs(
      { tools: [], operationsSource: source },
      logger,
    );

    expect(
      tools[0]!.input?.schema?.properties?.['q']?.descriptionProvider,
    ).toEqual({
      type: 'langfuse',
      prompt: 'search.query',
    });
    expect(tools[0]!.output?.descriptionProviders).toEqual({
      'results.title': { type: 'langfuse', prompt: 'search.title' },
    });
  });

  it('throws on invalid provider string in @mcpDescription on variable', () => {
    const source = `
      query Search($q: String! @mcpDescription(provider: "invalid")) @mcpTool(name: "search") {
        search(q: $q) { title }
      }
    `;
    expect(() =>
      resolveToolConfigs({ tools: [], operationsSource: source }, logger),
    ).toThrow('Invalid descriptionProvider directive format');
  });

  it('throws on invalid provider string in @mcpDescription on selection field', () => {
    const source = `
      query Search($q: String!) @mcpTool(name: "search") {
        search(q: $q) {
          title @mcpDescription(provider: "invalid")
        }
      }
    `;
    expect(() =>
      resolveToolConfigs({ tools: [], operationsSource: source }, logger),
    ).toThrow('Invalid descriptionProvider directive format');
  });

  it('ignores @mcpDescription on variables when operation has no @mcpTool', () => {
    const source = `
      query Search($q: String! @mcpDescription(provider: "langfuse:search.query")) {
        search(q: $q) { title }
      }
    `;
    const tools = resolveToolConfigs(
      { tools: [], operationsSource: source },
      logger,
    );
    expect(tools).toHaveLength(0);
  });
});
