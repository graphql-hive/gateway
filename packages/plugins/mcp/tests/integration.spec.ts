import { describe, expect, it } from 'vitest';
import { useMCP } from '../src/plugin.js';

describe('MCP Integration', () => {
  const mcpPlugin = useMCP({
    name: 'test-mcp',
    version: '1.0.0',
    path: '/mcp',
    tools: [
      {
        name: 'greet',
        source: { type: 'inline', query: 'query Greet($name: String!) { hello(name: $name) }' },
        tool: { description: 'Greet someone by name' },
      },
      {
        name: 'get_weather',
        source: {
          type: 'inline',
          query: `
            query GetWeather($location: String!) {
              weather(location: $location) {
                temperature
                conditions
              }
            }
          `,
        },
        tool: { description: 'Get weather for a location' },
      },
    ],
  });

  it('plugin exports correctly', () => {
    expect(mcpPlugin).toBeDefined();
    expect(mcpPlugin.onSchemaChange).toBeDefined();
    expect(mcpPlugin.onRequest).toBeDefined();
  });
});
