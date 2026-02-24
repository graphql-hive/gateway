import { describe, expect, it } from 'vitest';
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
});
