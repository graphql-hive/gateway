import { describe, expect, it } from 'vitest';
import { resolveToolConfigs } from '../src/plugin.js';

describe('resolveToolConfigs', () => {
  it('returns inline query tools unchanged', () => {
    const tools = resolveToolConfigs({
      tools: [
        { name: 'test', query: 'query { hello }' },
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

  it('throws when tool has neither query nor source', () => {
    expect(() =>
      resolveToolConfigs({
        tools: [{ name: 'broken' }],
      }),
    ).toThrow('must have either');
  });

  it('prefers source over query when both provided', () => {
    const operationsSource = `
      query FromFile($id: ID!) { getUser(id: $id) { name } }
    `;
    const tools = resolveToolConfigs({
      tools: [
        {
          name: 'user',
          query: 'query Inline { old }',
          source: { type: 'graphql', operationName: 'FromFile', operationType: 'query' },
        },
      ],
      operationsSource,
    });
    expect(tools[0]!.query).toContain('FromFile');
  });
});
