import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import type { MCPToolConfig } from '../src/plugin.js';
import { ToolRegistry } from '../src/registry.js';

describe('ToolRegistry', () => {
  const schema = buildSchema(`
    type Query {
      getWeather(location: String!): Weather
    }
    type Weather {
      temperature: Float!
    }
  `);

  const toolConfigs: MCPToolConfig[] = [
    {
      name: 'get_weather',
      description: 'Get weather for a location',
      query: `
        query GetWeather($location: String!) {
          getWeather(location: $location) {
            temperature
          }
        }
      `,
    },
  ];

  it('registers tools from config', () => {
    const registry = new ToolRegistry(toolConfigs, schema);
    expect(registry.getToolNames()).toEqual(['get_weather']);
  });

  it('returns tool by name', () => {
    const registry = new ToolRegistry(toolConfigs, schema);
    const tool = registry.getTool('get_weather');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('get_weather');
    expect(tool!.description).toBe('Get weather for a location');
  });

  it('returns undefined for unknown tool', () => {
    const registry = new ToolRegistry(toolConfigs, schema);
    expect(registry.getTool('unknown')).toBeUndefined();
  });

  it('generates MCP tool definitions with input schema', () => {
    const registry = new ToolRegistry(toolConfigs, schema);
    const mcpTools = registry.getMCPTools();

    expect(mcpTools).toHaveLength(1);
    expect(mcpTools[0]).toEqual({
      name: 'get_weather',
      description: 'Get weather for a location',
      inputSchema: {
        type: 'object',
        properties: {
          location: { type: 'string' },
        },
        required: ['location'],
      },
    });
  });
});
