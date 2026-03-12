import { describe, expect, it, vi } from 'vitest';
import {
  createProviderRegistry,
  resolveDescriptions,
  resolveFieldDescriptions,
  resolveProviders,
  type DescriptionProvider,
  type DescriptionProviderConfig,
} from '../src/description-provider.js';
import type { ResolvedToolConfig } from '../src/plugin.js';

describe('resolveProviders', () => {
  it('passes through runtime DescriptionProvider objects', async () => {
    const provider: DescriptionProvider = {
      fetchDescription: vi.fn(async () => 'desc'),
    };

    const registry = await resolveProviders({ mock: provider });
    expect(registry['mock']).toBe(provider);
  });

  it('throws for unknown provider names', async () => {
    await expect(resolveProviders({ unknown: {} })).rejects.toThrow(
      'Unknown provider "unknown"',
    );
  });
});

describe('resolveDescriptions', () => {
  const mockProvider: DescriptionProvider = {
    fetchDescription: vi.fn(
      async (_toolName: string, config: DescriptionProviderConfig) => {
        return `Description for ${config['prompt']}`;
      },
    ),
  };

  const providerRegistry = createProviderRegistry({ mock: mockProvider });

  it('resolves provider description for tools with descriptionProvider', async () => {
    const tools: ResolvedToolConfig[] = [
      {
        name: 'get_weather',
        query: 'query { weather { temp } }',
        tool: {
          descriptionProvider: { type: 'mock', prompt: 'weather_desc' },
        },
      },
    ];

    const resolved = await resolveDescriptions(tools, providerRegistry);
    expect(resolved[0]!.providerDescription).toBe(
      'Description for weather_desc',
    );
  });

  it('leaves providerDescription undefined when no descriptionProvider configured', async () => {
    const tools: ResolvedToolConfig[] = [
      {
        name: 'get_weather',
        query: 'query { weather { temp } }',
        tool: { description: 'Static desc' },
      },
    ];

    const resolved = await resolveDescriptions(tools, providerRegistry);
    expect(resolved[0]!.providerDescription).toBeUndefined();
  });

  it('throws on startup when provider fails', async () => {
    const failingProvider: DescriptionProvider = {
      fetchDescription: vi.fn(async () => {
        throw new Error('Langfuse unreachable');
      }),
    };
    const registry = createProviderRegistry({ failing: failingProvider });

    const tools: ResolvedToolConfig[] = [
      {
        name: 'get_weather',
        query: 'query { weather { temp } }',
        tool: {
          descriptionProvider: { type: 'failing', prompt: 'test' },
        },
      },
    ];

    await expect(
      resolveDescriptions(tools, registry, { isStartup: true }),
    ).rejects.toThrow('Langfuse unreachable');
  });

  it('warns and returns undefined providerDescription on refresh failure', async () => {
    const failingProvider: DescriptionProvider = {
      fetchDescription: vi.fn(async () => {
        throw new Error('Network timeout');
      }),
    };
    const registry = createProviderRegistry({ failing: failingProvider });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tools: ResolvedToolConfig[] = [
      {
        name: 'get_weather',
        query: 'query { weather { temp } }',
        tool: {
          descriptionProvider: { type: 'failing', prompt: 'test' },
        },
      },
    ];

    const resolved = await resolveDescriptions(tools, registry, {
      isStartup: false,
    });
    expect(resolved[0]!.providerDescription).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('get_weather'),
    );
    warnSpy.mockRestore();
  });

  it('throws when provider type is not registered', async () => {
    const tools: ResolvedToolConfig[] = [
      {
        name: 'get_weather',
        query: 'query { weather { temp } }',
        tool: {
          descriptionProvider: { type: 'unknown', prompt: 'test' },
        },
      },
    ];

    await expect(
      resolveDescriptions(tools, providerRegistry, { isStartup: true }),
    ).rejects.toThrow('Unknown description provider type: "unknown"');
  });
});

describe('resolveFieldDescriptions', () => {
  const mockProvider: DescriptionProvider = {
    fetchDescription: vi.fn(
      async (_toolName: string, config: DescriptionProviderConfig) => {
        return `Field desc for ${config['prompt']}`;
      },
    ),
  };

  const providerRegistry = createProviderRegistry({ mock: mockProvider });

  it('resolves per-field descriptions from providers', async () => {
    const tools: ResolvedToolConfig[] = [
      {
        name: 'search',
        query: 'query { search }',
        input: {
          schema: {
            properties: {
              q: {
                descriptionProvider: { type: 'mock', prompt: 'search_query' },
              },
            },
          },
        },
      },
    ];

    const result = await resolveFieldDescriptions(tools, providerRegistry);
    expect(result.get('search')?.get('q')).toBe(
      'Field desc for search_query',
    );
  });

  it('skips tools without field providers', async () => {
    const tools: ResolvedToolConfig[] = [
      {
        name: 'search',
        query: 'query { search }',
        input: {
          schema: {
            properties: {
              q: { description: 'static' },
            },
          },
        },
      },
    ];

    const result = await resolveFieldDescriptions(tools, providerRegistry);
    expect(result.size).toBe(0);
  });

  it('throws on startup when provider fails', async () => {
    const failingProvider: DescriptionProvider = {
      fetchDescription: vi.fn(async () => {
        throw new Error('Langfuse unreachable');
      }),
    };
    const registry = createProviderRegistry({ failing: failingProvider });

    const tools: ResolvedToolConfig[] = [
      {
        name: 'search',
        query: 'query { search }',
        input: {
          schema: {
            properties: {
              q: {
                descriptionProvider: { type: 'failing', prompt: 'test' },
              },
            },
          },
        },
      },
    ];

    await expect(
      resolveFieldDescriptions(tools, registry, { isStartup: true }),
    ).rejects.toThrow('Langfuse unreachable');
  });

  it('warns and skips field on runtime failure', async () => {
    const failingProvider: DescriptionProvider = {
      fetchDescription: vi.fn(async () => {
        throw new Error('Network timeout');
      }),
    };
    const registry = createProviderRegistry({ failing: failingProvider });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tools: ResolvedToolConfig[] = [
      {
        name: 'search',
        query: 'query { search }',
        input: {
          schema: {
            properties: {
              q: {
                descriptionProvider: { type: 'failing', prompt: 'test' },
              },
            },
          },
        },
      },
    ];

    const result = await resolveFieldDescriptions(tools, registry, {
      isStartup: false,
    });
    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('search'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('q'),
    );
    warnSpy.mockRestore();
  });

  it('throws for unknown provider type', async () => {
    const tools: ResolvedToolConfig[] = [
      {
        name: 'search',
        query: 'query { search }',
        input: {
          schema: {
            properties: {
              q: {
                descriptionProvider: { type: 'unknown', prompt: 'test' },
              },
            },
          },
        },
      },
    ];

    await expect(
      resolveFieldDescriptions(tools, providerRegistry),
    ).rejects.toThrow(
      'Unknown field description provider type: "unknown"',
    );
  });
});
