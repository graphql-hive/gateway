import { describe, expect, it, vi } from 'vitest';
import { createLangfuseProvider } from '../../src/providers/langfuse.js';

function mockLangfuse(compileFn: () => string = () => 'description') {
  return {
    prompt: {
      get: vi.fn(async () => ({ compile: compileFn })),
    },
  };
}

describe('Langfuse provider', () => {
  it('fetches description from Langfuse prompt', async () => {
    const client = mockLangfuse(() => 'Get weather data for a city');

    const provider = createLangfuseProvider(client as any);
    const description = await provider.fetchDescription('get_weather', {
      type: 'langfuse',
      prompt: 'weather_tool_description',
    });

    expect(description).toBe('Get weather data for a city');
    expect(client.prompt.get).toHaveBeenCalledWith('weather_tool_description', {
      version: undefined,
      type: 'text',
    });
  });

  it('passes version in options', async () => {
    const client = mockLangfuse(() => 'versioned description');

    const provider = createLangfuseProvider(client as any);
    await provider.fetchDescription('tool', {
      type: 'langfuse',
      prompt: 'my_prompt',
      version: 2,
    });

    expect(client.prompt.get).toHaveBeenCalledWith(
      'my_prompt',
      expect.objectContaining({ version: 2, type: 'text' }),
    );
  });

  it('passes options to prompt.get', async () => {
    const client = mockLangfuse(() => 'labeled description');

    const provider = createLangfuseProvider(client as any);
    await provider.fetchDescription('tool', {
      type: 'langfuse',
      prompt: 'my_prompt',
      options: { label: 'production', cacheTtlSeconds: 5 },
    });

    expect(client.prompt.get).toHaveBeenCalledWith(
      'my_prompt',
      expect.objectContaining({
        label: 'production',
        cacheTtlSeconds: 5,
        type: 'text',
      }),
    );
  });

  it('throws when prompt field is missing', async () => {
    const client = mockLangfuse();

    const provider = createLangfuseProvider(client as any);
    await expect(
      provider.fetchDescription('tool', { type: 'langfuse' }),
    ).rejects.toThrow('requires a non-empty "prompt" field');
  });

  it('throws when prompt field is empty string', async () => {
    const client = mockLangfuse();

    const provider = createLangfuseProvider(client as any);
    await expect(
      provider.fetchDescription('tool', { type: 'langfuse', prompt: '' }),
    ).rejects.toThrow('requires a non-empty "prompt" field');
  });

  it('throws when Langfuse client fails', async () => {
    const client = {
      prompt: {
        get: vi.fn(async () => {
          throw new Error('Langfuse API error');
        }),
      },
    };

    const provider = createLangfuseProvider(client as any);
    await expect(
      provider.fetchDescription('tool', {
        type: 'langfuse',
        prompt: 'missing',
      }),
    ).rejects.toThrow('Langfuse API error');
  });

  describe('defaults and context', () => {
    function createMockClient() {
      return {
        prompt: {
          get: vi.fn(async (_name: string, options?: any) => ({
            compile: () => `compiled with label=${options?.label ?? 'none'}`,
          })),
        },
      };
    }

    it('uses global defaults when no per-tool options', async () => {
      const client = createMockClient();
      const provider = createLangfuseProvider(client as any, {
        label: 'preproduction',
      });

      await provider.fetchDescription('tool', {
        type: 'langfuse',
        prompt: 'my_prompt',
      });

      expect(client.prompt.get).toHaveBeenCalledWith(
        'my_prompt',
        expect.objectContaining({ label: 'preproduction' }),
      );
    });

    it('per-tool options override global defaults', async () => {
      const client = createMockClient();
      const provider = createLangfuseProvider(client as any, {
        label: 'preproduction',
      });

      await provider.fetchDescription('tool', {
        type: 'langfuse',
        prompt: 'my_prompt',
        options: { label: 'production' },
      });

      expect(client.prompt.get).toHaveBeenCalledWith(
        'my_prompt',
        expect.objectContaining({ label: 'production' }),
      );
    });

    it('per-request context label overrides everything', async () => {
      const client = createMockClient();
      const provider = createLangfuseProvider(client as any, {
        label: 'preproduction',
      });

      await provider.fetchDescription(
        'tool',
        {
          type: 'langfuse',
          prompt: 'my_prompt',
          options: { label: 'production' },
        },
        { label: 'staging' },
      );

      expect(client.prompt.get).toHaveBeenCalledWith(
        'my_prompt',
        expect.objectContaining({ label: 'staging' }),
      );
    });

    it('version takes precedence and strips label', async () => {
      const client = createMockClient();
      const provider = createLangfuseProvider(client as any, {
        label: 'preproduction',
      });

      await provider.fetchDescription('tool', {
        type: 'langfuse',
        prompt: 'my_prompt',
        version: 5,
        options: { label: 'production' },
      });

      const calledOptions = client.prompt.get.mock.calls[0]![1];
      expect(calledOptions).toMatchObject({ version: 5, type: 'text' });
      expect(calledOptions).not.toHaveProperty('label');
    });

    it('context without label does not override defaults', async () => {
      const client = createMockClient();
      const provider = createLangfuseProvider(client as any, {
        label: 'preproduction',
      });

      await provider.fetchDescription(
        'tool',
        { type: 'langfuse', prompt: 'my_prompt' },
        {},
      );

      expect(client.prompt.get).toHaveBeenCalledWith(
        'my_prompt',
        expect.objectContaining({ label: 'preproduction' }),
      );
    });

    it('works without defaults or context', async () => {
      const client = createMockClient();
      const provider = createLangfuseProvider(client as any);

      await provider.fetchDescription('tool', {
        type: 'langfuse',
        prompt: 'my_prompt',
      });

      expect(client.prompt.get).toHaveBeenCalledWith('my_prompt', {
        version: undefined,
        type: 'text',
      });
    });
  });
});
