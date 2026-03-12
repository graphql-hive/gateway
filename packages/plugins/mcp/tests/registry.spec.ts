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
          getWeather: {
            type: 'object',
            properties: {
              temperature: { type: 'number', format: 'float' },
            },
          },
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
      [
        {
          name: 'search',
          query:
            'query($query: String!, $category: String) { searchProducts(query: $query, category: $category) }',
          tool: { title: 'Product Search' },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.title).toBe('Product Search');
  });

  it('omits title when not provided', () => {
    const registry = new ToolRegistry(
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.title).toBeUndefined();
  });

  it('applies field-level input schema overrides', () => {
    const registry = new ToolRegistry(
      [
        {
          name: 'search',
          query:
            'query($query: String!, $category: String) { searchProducts(query: $query, category: $category) }',
          input: {
            schema: {
              properties: {
                query: { description: 'Keyword like blue shoes' },
              },
            },
          },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    // Override should win over schema description
    expect(tools[0]!.inputSchema.properties!['query']!.description).toBe(
      'Keyword like blue shoes',
    );
    // Non-overridden field keeps schema description (none in this case for category)
    expect(
      tools[0]!.inputSchema.properties!['category']!.description,
    ).toBeUndefined();
  });

  it('renames input properties when alias is set', () => {
    const registry = new ToolRegistry(
      [
        {
          name: 'search',
          query:
            'query($query: String!, $category: String) { searchProducts(query: $query, category: $category) }',
          input: {
            schema: {
              properties: {
                query: { alias: 'searchQuery', description: 'Search term' },
              },
            },
          },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    // Alias replaces original name
    expect(tools[0]!.inputSchema.properties!['searchQuery']).toBeDefined();
    expect(tools[0]!.inputSchema.properties!['query']).toBeUndefined();
    // Description is applied to the aliased property
    expect(
      tools[0]!.inputSchema.properties!['searchQuery']!.description,
    ).toBe('Search term');
    // Non-aliased field is unchanged
    expect(tools[0]!.inputSchema.properties!['category']).toBeDefined();
    // Required array uses alias name
    expect(tools[0]!.inputSchema.required).toContain('searchQuery');
    expect(tools[0]!.inputSchema.required).not.toContain('query');
  });

  it('stores argumentAliases on registered tool', () => {
    const registry = new ToolRegistry(
      [
        {
          name: 'search',
          query:
            'query($query: String!) { searchProducts(query: $query) }',
          input: {
            schema: {
              properties: {
                query: { alias: 'searchQuery' },
              },
            },
          },
        },
      ],
      schema,
    );
    const tool = registry.getTool('search');
    expect(tool!.argumentAliases).toEqual({ searchQuery: 'query' });
  });

  it('config description wins over schema description', () => {
    const registry = new ToolRegistry(
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          tool: { description: 'Custom description' },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.description).toBe('Custom description');
  });

  it('config description used when no schema description', () => {
    const noDescSchema = buildSchema(`
      type Query {
        searchProducts(query: String!): String
      }
    `);
    const registry = new ToolRegistry(
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          tool: { description: 'Custom description' },
        },
      ],
      noDescSchema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.description).toBe('Custom description');
  });

  it('directive description wins over schema description', () => {
    const registry = new ToolRegistry(
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          directiveDescription: 'From directive',
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.description).toBe('From directive');
  });

  it('falls back to schema description when no config description', () => {
    const registry = new ToolRegistry(
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.description).toBe('Search products by keyword');
  });

  it('throws when alias collides with existing field', () => {
    expect(
      () =>
        new ToolRegistry(
          [
            {
              name: 'search',
              query:
                'query($query: String!, $category: String) { searchProducts(query: $query, category: $category) }',
              input: {
                schema: {
                  properties: {
                    query: { alias: 'category' },
                  },
                },
              },
            },
          ],
          schema,
        ),
    ).toThrow(
      'Alias "category" for field "query" in tool "search" collides with existing field "category"',
    );
  });

  it('throws when override references non-existent field', () => {
    expect(
      () =>
        new ToolRegistry(
          [
            {
              name: 'search',
              query: 'query($query: String!) { searchProducts(query: $query) }',
              input: {
                schema: {
                  properties: {
                    nonExistent: { description: 'does not exist' },
                  },
                },
              },
            },
          ],
          schema,
        ),
    ).toThrow('nonExistent');
  });

  it('throws when alias is empty string', () => {
    expect(
      () =>
        new ToolRegistry(
          [
            {
              name: 'search',
              query: 'query($query: String!) { searchProducts(query: $query) }',
              input: {
                schema: {
                  properties: {
                    query: { alias: '' },
                  },
                },
              },
            },
          ],
          schema,
        ),
    ).toThrow('must be a non-empty string');
  });

  it('throws when two fields alias to the same name', () => {
    const multiFieldSchema = buildSchema(`
      type Query {
        searchProducts(query: String!, category: String): String
      }
    `);
    expect(
      () =>
        new ToolRegistry(
          [
            {
              name: 'search',
              query:
                'query($query: String!, $category: String) { searchProducts(query: $query, category: $category) }',
              input: {
                schema: {
                  properties: {
                    query: { alias: 'term' },
                    category: { alias: 'term' },
                  },
                },
              },
            },
          ],
          multiFieldSchema,
        ),
    ).toThrow('Alias "term"');
  });

  it('does not leak descriptionProvider into inputSchema', () => {
    const registry = new ToolRegistry(
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          input: {
            schema: {
              properties: {
                query: {
                  description: 'Search term',
                  descriptionProvider: { type: 'mock', prompt: 'test' },
                },
              },
            },
          },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    const prop = tools[0]!.inputSchema.properties!['query']!;
    expect(prop.description).toBe('Search term');
    expect((prop as any).descriptionProvider).toBeUndefined();
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
      [
        {
          name: 'weather',
          query:
            'query($location: String!) { getWeather(location: $location) { temperature } }',
        },
      ],
      schemaWithOutput,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.outputSchema).toEqual({
      type: 'object',
      properties: {
        getWeather: {
          type: 'object',
          properties: {
            temperature: { type: 'number', format: 'float' },
          },
        },
      },
    });
  });
});
