import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import type { ResolvedToolConfig } from '../src/plugin.js';
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

  const toolConfigs: ResolvedToolConfig[] = [
    {
      name: 'get_weather',
      tool: { description: 'Get weather for a location' },
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
      outputSchema: {
        type: 'object',
        properties: {
          temperature: { type: 'number', format: 'float' },
        },
      },
    });
  });
});

describe('ToolRegistry with overrides', () => {
  const schema = buildSchema(`
    type Query {
      "Search products by keyword"
      searchProducts(
        "Search query text"
        query: String!
        category: String
      ): String
    }
  `);

  it('includes title in MCP tool definition when provided', () => {
    const registry = new ToolRegistry(
      [{
        name: 'search',
        query: 'query($query: String!, $category: String) { searchProducts(query: $query, category: $category) }',
        tool: { title: 'Product Search' },
      }],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.title).toBe('Product Search');
  });

  it('omits title when not provided', () => {
    const registry = new ToolRegistry(
      [{
        name: 'search',
        query: 'query($query: String!) { searchProducts(query: $query) }',
      }],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.title).toBeUndefined();
  });

  it('applies field-level input schema overrides', () => {
    const registry = new ToolRegistry(
      [{
        name: 'search',
        query: 'query($query: String!, $category: String) { searchProducts(query: $query, category: $category) }',
        input: {
          schema: {
            properties: {
              query: { description: 'Keyword like blue shoes' },
            },
          },
        },
      }],
      schema,
    );
    const tools = registry.getMCPTools();
    // Override should win over schema description
    expect(tools[0]!.inputSchema.properties!['query']!.description).toBe('Keyword like blue shoes');
    // Non-overridden field keeps schema description (none in this case for category)
    expect(tools[0]!.inputSchema.properties!['category']!.description).toBeUndefined();
  });

  it('uses tool.description over schema description', () => {
    const registry = new ToolRegistry(
      [{
        name: 'search',
        query: 'query($query: String!) { searchProducts(query: $query) }',
        tool: { description: 'Custom description' },
      }],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.description).toBe('Custom description');
  });

  it('falls back to schema description when no config description', () => {
    const registry = new ToolRegistry(
      [{
        name: 'search',
        query: 'query($query: String!) { searchProducts(query: $query) }',
      }],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.description).toBe('Search products by keyword');
  });

  it('includes output schema', () => {
    const schemaWithOutput = buildSchema(`
      type Query {
        getWeather(location: String!): Weather
      }
      type Weather {
        temperature: Float!
      }
    `);
    const registry = new ToolRegistry(
      [{
        name: 'weather',
        query: 'query($location: String!) { getWeather(location: $location) { temperature } }',
      }],
      schemaWithOutput,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.outputSchema).toEqual({
      type: 'object',
      properties: {
        temperature: { type: 'number', format: 'float' },
      },
    });
  });
});
