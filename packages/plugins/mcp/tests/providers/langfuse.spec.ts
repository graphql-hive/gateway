import { describe, expect, it, vi } from 'vitest';
import { createLangfuseProvider } from '../../src/providers/langfuse.js';

describe('Langfuse provider', () => {
  it('fetches description from Langfuse prompt', async () => {
    const mockClient = {
      getPrompt: vi.fn(async () => ({
        compile: () => 'Get weather data for a city',
      })),
    };

    const provider = createLangfuseProvider(mockClient as any);
    const description = await provider.fetchDescription('get_weather', {
      type: 'langfuse',
      prompt: 'weather_tool_description',
    });

    expect(description).toBe('Get weather data for a city');
    expect(mockClient.getPrompt).toHaveBeenCalledWith('weather_tool_description', undefined, undefined);
  });

  it('passes version as positional arg', async () => {
    const mockClient = {
      getPrompt: vi.fn(async () => ({
        compile: () => 'versioned description',
      })),
    };

    const provider = createLangfuseProvider(mockClient as any);
    await provider.fetchDescription('tool', {
      type: 'langfuse',
      prompt: 'my_prompt',
      version: 2,
    });

    expect(mockClient.getPrompt).toHaveBeenCalledWith('my_prompt', 2, undefined);
  });

  it('passes label in options', async () => {
    const mockClient = {
      getPrompt: vi.fn(async () => ({
        compile: () => 'labeled description',
      })),
    };

    const provider = createLangfuseProvider(mockClient as any);
    await provider.fetchDescription('tool', {
      type: 'langfuse',
      prompt: 'my_prompt',
      label: 'production',
    });

    expect(mockClient.getPrompt).toHaveBeenCalledWith('my_prompt', undefined, { label: 'production' });
  });

  it('throws when prompt field is missing', async () => {
    const mockClient = {
      getPrompt: vi.fn(async () => ({ compile: () => '' })),
    };

    const provider = createLangfuseProvider(mockClient as any);
    await expect(
      provider.fetchDescription('tool', { type: 'langfuse' }),
    ).rejects.toThrow('requires a non-empty "prompt" field');
  });

  it('throws when prompt field is empty string', async () => {
    const mockClient = {
      getPrompt: vi.fn(async () => ({ compile: () => '' })),
    };

    const provider = createLangfuseProvider(mockClient as any);
    await expect(
      provider.fetchDescription('tool', { type: 'langfuse', prompt: '' }),
    ).rejects.toThrow('requires a non-empty "prompt" field');
  });

  it('throws when Langfuse client fails', async () => {
    const mockClient = {
      getPrompt: vi.fn(async () => {
        throw new Error('Langfuse API error');
      }),
    };

    const provider = createLangfuseProvider(mockClient as any);
    await expect(
      provider.fetchDescription('tool', { type: 'langfuse', prompt: 'missing' }),
    ).rejects.toThrow('Langfuse API error');
  });
});
