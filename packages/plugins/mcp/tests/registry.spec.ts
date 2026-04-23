import { createLoggerFromLogging } from '@graphql-hive/gateway-runtime';
import { buildSchema, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { resolveToolConfigs, type ResolvedToolConfig } from '../src/plugin.js';
import { getByPath, ToolRegistry } from '../src/registry.js';

const logger = createLoggerFromLogging(false);

describe('getByPath', () => {
  it('extracts a shallow key', () => {
    expect(getByPath({ a: 1 }, 'a')).toBe(1);
  });

  it('extracts a deep key', () => {
    expect(getByPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('returns undefined for missing key', () => {
    expect(getByPath({ a: 1 }, 'b')).toBeUndefined();
  });

  it('returns undefined for non-object intermediate', () => {
    expect(getByPath({ a: 'string' }, 'a.b')).toBeUndefined();
  });

  it('returns undefined when intermediate is null', () => {
    expect(getByPath({ a: null }, 'a.b')).toBeUndefined();
  });

  it('returns undefined when root is null', () => {
    expect(getByPath(null, 'a')).toBeUndefined();
  });

  it('returns undefined when root is undefined', () => {
    expect(getByPath(undefined, 'a')).toBeUndefined();
  });

  it('returns falsy values correctly', () => {
    expect(getByPath({ a: { b: 0 } }, 'a.b')).toBe(0);
    expect(getByPath({ a: { b: false } }, 'a.b')).toBe(false);
    expect(getByPath({ a: { b: '' } }, 'a.b')).toBe('');
  });

  it('returns array value at leaf', () => {
    expect(getByPath({ a: [1, 2, 3] }, 'a')).toEqual([1, 2, 3]);
  });
});

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
    const registry = new ToolRegistry({ log: logger }, toolConfigs, schema);
    expect(registry.getToolNames()).toEqual(['get_weather']);
  });

  it('returns tool by name', () => {
    const registry = new ToolRegistry({ log: logger }, toolConfigs, schema);
    const tool = registry.getTool('get_weather');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('get_weather');
    expect(tool!.description).toBe('Get weather for a location');
  });

  it('returns undefined for unknown tool', () => {
    const registry = new ToolRegistry({ log: logger }, toolConfigs, schema);
    expect(registry.getTool('unknown')).toBeUndefined();
  });

  it('generates MCP tool definitions with input schema', () => {
    const registry = new ToolRegistry({ log: logger }, toolConfigs, schema);
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

  it('includes annotations, icons, and execution in MCP tool definitions', () => {
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'get_weather',
          query:
            'query GetWeather($location: String!) { getWeather(location: $location) { temperature } }',
          tool: {
            annotations: {
              readOnlyHint: true,
              idempotentHint: true,
            },
            icons: [
              {
                src: 'https://example.com/weather.png',
                mimeType: 'image/png',
                sizes: ['48x48'],
              },
            ],
            execution: { taskSupport: 'optional' },
            _meta: { team: 'platform', version: '2.1' },
          },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();

    expect(tools[0]!.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
    });
    expect(tools[0]!.icons).toEqual([
      {
        src: 'https://example.com/weather.png',
        mimeType: 'image/png',
        sizes: ['48x48'],
      },
    ]);
    expect(tools[0]!.execution).toEqual({ taskSupport: 'optional' });
    expect(tools[0]!._meta).toEqual({ team: 'platform', version: '2.1' });
  });

  it('omits annotations, icons, and execution when not provided', () => {
    const registry = new ToolRegistry({ log: logger }, toolConfigs, schema);
    const tools = registry.getMCPTools();

    expect(tools[0]!.annotations).toBeUndefined();
    expect(tools[0]!.icons).toBeUndefined();
    expect(tools[0]!.execution).toBeUndefined();
  });
});

describe('ToolRegistry with directive _meta', () => {
  const schema = buildSchema(`
    type Query {
      searchProducts(query: String!): String
    }
  `);

  it('passes directive meta as _meta to registered tool', () => {
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          tool: {},
          directiveMeta: { entitlement: 'docs_access', permissions: ['read'] },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!._meta).toEqual({
      entitlement: 'docs_access',
      permissions: ['read'],
    });
  });

  it('shallow merges directive meta with config _meta (config wins on key conflicts)', () => {
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          tool: { _meta: { entitlement: 'override', extra: true } },
          directiveMeta: { entitlement: 'docs_access', permissions: ['read'] },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!._meta).toEqual({
      entitlement: 'override',
      permissions: ['read'],
      extra: true,
    });
  });

  it('uses only config _meta when no directive meta', () => {
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          tool: { _meta: { team: 'platform' } },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!._meta).toEqual({ team: 'platform' });
  });

  it('uses only directive meta when no config _meta', () => {
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          directiveMeta: { team: 'platform' },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!._meta).toEqual({ team: 'platform' });
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
      { log: logger },
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
      { log: logger },
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
      { log: logger },
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
      { log: logger },
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
    expect(tools[0]!.inputSchema.properties!['searchQuery']!.description).toBe(
      'Search term',
    );
    // Non-aliased field is unchanged
    expect(tools[0]!.inputSchema.properties!['category']).toBeDefined();
    // Required array uses alias name
    expect(tools[0]!.inputSchema.required).toContain('searchQuery');
    expect(tools[0]!.inputSchema.required).not.toContain('query');
  });

  it('stores argumentAliases on registered tool', () => {
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
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
      { log: logger },
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
      { log: logger },
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
      { log: logger },
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
      { log: logger },
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
          { log: logger },
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
          { log: logger },
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
          { log: logger },
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
          { log: logger },
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

  it('hides header-mapped variables from input schema', () => {
    const twoFieldSchema = buildSchema(`
      type Query {
        searchProducts(query: String!, companyId: String!): String
      }
    `);
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query:
            'query($query: String!, $companyId: String!) { searchProducts(query: $query, companyId: $companyId) }',
          headerMappings: { companyId: 'x-company-id' },
        },
      ],
      twoFieldSchema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.inputSchema.properties!['companyId']).toBeUndefined();
    expect(tools[0]!.inputSchema.properties!['query']).toBeDefined();
    expect(tools[0]!.inputSchema.required).toEqual(['query']);
  });

  it('stores headerMappings on registered tool', () => {
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          headerMappings: { query: 'x-query' },
        },
      ],
      schema,
    );
    const tool = registry.getTool('search');
    expect(tool!.headerMappings).toEqual({ query: 'x-query' });
  });

  it('throws when headerMappings references non-existent variable', () => {
    expect(
      () =>
        new ToolRegistry(
          { log: logger },
          [
            {
              name: 'search',
              query: 'query($query: String!) { searchProducts(query: $query) }',
              headerMappings: { nonExistent: 'x-header' },
            },
          ],
          schema,
        ),
    ).toThrow('@mcpHeader on variable "$nonExistent"');
  });

  it('throws when headerMappings and input overrides target the same field', () => {
    expect(
      () =>
        new ToolRegistry(
          { log: logger },
          [
            {
              name: 'search',
              query: 'query($query: String!) { searchProducts(query: $query) }',
              headerMappings: { query: 'x-query' },
              input: {
                schema: {
                  properties: {
                    query: { description: 'conflict' },
                  },
                },
              },
            },
          ],
          schema,
        ),
    ).toThrow('both @mcpHeader and input schema overrides');
  });

  it('hides required field from input schema when hidden is true', () => {
    const twoFieldSchema = buildSchema(`
      type Query {
        searchProducts(query: String!, category: String): String
      }
    `);
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query:
            'query($query: String!, $category: String) { searchProducts(query: $query, category: $category) }',
          input: {
            schema: {
              properties: {
                query: { hidden: true },
              },
            },
          },
        },
      ],
      twoFieldSchema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.inputSchema.properties!['query']).toBeUndefined();
    expect(tools[0]!.inputSchema.properties!['category']).toBeDefined();
    expect(tools[0]!.inputSchema.required).toBeUndefined();
  });

  it('hides optional field from input schema when hidden is true', () => {
    const twoFieldSchema = buildSchema(`
      type Query {
        searchProducts(query: String!, category: String): String
      }
    `);
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query:
            'query($query: String!, $category: String) { searchProducts(query: $query, category: $category) }',
          input: {
            schema: {
              properties: {
                category: { hidden: true },
              },
            },
          },
        },
      ],
      twoFieldSchema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.inputSchema.properties!['category']).toBeUndefined();
    expect(tools[0]!.inputSchema.properties!['query']).toBeDefined();
    expect(tools[0]!.inputSchema.required).toEqual(['query']);
  });

  it('hides aliased field from input schema', () => {
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          input: {
            schema: {
              properties: {
                query: { alias: 'searchQuery', hidden: true },
              },
            },
          },
        },
      ],
      schema,
    );
    const tools = registry.getMCPTools();
    expect(tools[0]!.inputSchema.properties!['query']).toBeUndefined();
    expect(tools[0]!.inputSchema.properties!['searchQuery']).toBeUndefined();
    expect(tools[0]!.inputSchema.required).toBeUndefined();
  });

  it('does not leak descriptionProvider into inputSchema', () => {
    const registry = new ToolRegistry(
      { log: logger },
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

  it('narrows output schema when output.path is set', () => {
    const nestedSchema = buildSchema(`
      type Query {
        search(query: String!): SearchResult
      }
      type SearchResult {
        items: [Item!]!
        total: Int
      }
      type Item {
        name: String
        score: Float
      }
    `);
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query:
            'query($query: String!) { search(query: $query) { items { name score } total } }',
          output: { path: 'search.items' },
        },
      ],
      nestedSchema,
    );
    const tools = registry.getMCPTools();
    // Output schema should be narrowed to the items array schema
    expect(tools[0]!.outputSchema).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          score: { type: 'number', format: 'float' },
        },
      },
    });
  });

  it('narrows output schema to single level path', () => {
    const schemaWithOutput = buildSchema(`
      type Query {
        getWeather(location: String!): Weather
      }
      type Weather {
        temperature: Float!
      }
    `);
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'weather',
          query:
            'query($location: String!) { getWeather(location: $location) { temperature } }',
          output: { path: 'getWeather' },
        },
      ],
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

  it('stores outputPath on registered tool', () => {
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'search',
          query: 'query($query: String!) { searchProducts(query: $query) }',
          output: { path: 'searchProducts' },
        },
      ],
      schema,
    );
    const tool = registry.getTool('search');
    expect(tool!.outputPath).toBe('searchProducts');
  });

  it('throws when hooks.preprocess is not a function', () => {
    expect(
      () =>
        new ToolRegistry(
          { log: logger },
          [
            {
              name: 'bad_hooks',
              query:
                'query($location: String!) { getWeather(location: $location) { temperature } }',
              hooks: { preprocess: 'not a function' as any },
            },
          ],
          schema,
        ),
    ).toThrow('hooks.preprocess must be a function');
  });

  it('throws when hooks.postprocess is not a function', () => {
    expect(
      () =>
        new ToolRegistry(
          { log: logger },
          [
            {
              name: 'bad_hooks',
              query:
                'query($location: String!) { getWeather(location: $location) { temperature } }',
              hooks: { postprocess: 42 as any },
            },
          ],
          schema,
        ),
    ).toThrow('hooks.postprocess must be a function');
  });

  it('omits outputSchema from getMCPTools when hooks are configured', () => {
    const weatherSchema = buildSchema(`
      type Query { getWeather(location: String!): Weather }
      type Weather { temperature: Float! }
    `);
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'with_postprocess',
          query:
            'query($location: String!) { getWeather(location: $location) { temperature } }',
          hooks: { postprocess: () => 'transformed' },
        },
        {
          name: 'with_preprocess',
          query:
            'query($location: String!) { getWeather(location: $location) { temperature } }',
          hooks: { preprocess: () => undefined },
        },
        {
          name: 'no_hooks',
          query:
            'query($location: String!) { getWeather(location: $location) { temperature } }',
        },
      ],
      weatherSchema,
    );
    const tools = registry.getMCPTools();
    expect(
      tools.find((t) => t.name === 'with_postprocess')!.outputSchema,
    ).toBeUndefined();
    expect(
      tools.find((t) => t.name === 'with_preprocess')!.outputSchema,
    ).toBeUndefined();
    expect(
      tools.find((t) => t.name === 'no_hooks')!.outputSchema,
    ).toBeDefined();
  });

  it('omits outputSchema from getMCPTools when output.schema is false', () => {
    const weatherSchema = buildSchema(`
      type Query { getWeather(location: String!): Weather }
      type Weather { temperature: Float! }
    `);
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'suppressed',
          query:
            'query($location: String!) { getWeather(location: $location) { temperature } }',
          output: { schema: false },
        },
        {
          name: 'normal',
          query:
            'query($location: String!) { getWeather(location: $location) { temperature } }',
        },
      ],
      weatherSchema,
    );
    const tools = registry.getMCPTools();
    expect(
      tools.find((t) => t.name === 'suppressed')!.outputSchema,
    ).toBeUndefined();
    expect(tools.find((t) => t.name === 'normal')!.outputSchema).toBeDefined();
  });

  it('omits all outputSchemas when getMCPTools suppressOutputSchema option is true', () => {
    const weatherSchema = buildSchema(`
      type Query { getWeather(location: String!): Weather }
      type Weather { temperature: Float! }
    `);
    const registry = new ToolRegistry(
      { log: logger },
      [
        {
          name: 'weather',
          query:
            'query($location: String!) { getWeather(location: $location) { temperature } }',
        },
      ],
      weatherSchema,
    );
    expect(registry.getMCPTools()[0]!.outputSchema).toBeDefined();
    expect(
      registry.getMCPTools({ suppressOutputSchema: true })[0]!.outputSchema,
    ).toBeUndefined();
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
      { log: logger },
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

describe('meta directive integration (resolveToolConfigs -> ToolRegistry -> getMCPTools)', () => {
  const schema = buildSchema(`
    type Query {
      weather(location: String!): Weather
    }
    type Weather {
      temperature: Float
      conditions: String
    }
  `);

  it('directive meta flows through to _meta in MCP tool listing', () => {
    const operationsSource = parse(`
      query MetaWeather($location: String!) @mcpTool(
        name: "meta_weather"
        description: "Weather with metadata"
        meta: { entitlement: "weather_access", tags: ["read", "public"], version: 2 }
      ) {
        weather(location: $location) { temperature conditions }
      }
    `);
    const configs = resolveToolConfigs(
      { log: logger },
      { tools: [], operationsSource },
    );
    const registry = new ToolRegistry({ log: logger }, configs, schema);
    const tools = registry.getMCPTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('meta_weather');
    expect(tools[0]!._meta).toEqual({
      entitlement: 'weather_access',
      tags: ['read', 'public'],
      version: 2,
    });
  });

  it('config _meta shallow merges with directive meta end-to-end', () => {
    const operationsSource = parse(`
      query MetaWeather($location: String!) @mcpTool(
        name: "meta_weather"
        description: "Weather with metadata"
        meta: { entitlement: "weather_access", tags: ["read"], version: 1 }
      ) {
        weather(location: $location) { temperature }
      }
    `);
    const configs = resolveToolConfigs(
      { log: logger },
      {
        tools: [
          {
            name: 'meta_weather',
            source: {
              type: 'graphql',
              operationName: 'MetaWeather',
              operationType: 'query' as const,
            },
            tool: {
              _meta: { entitlement: 'config_override', team: 'platform' },
            },
          },
        ],
        operationsSource,
      },
    );
    const registry = new ToolRegistry({ log: logger }, configs, schema);
    const tools = registry.getMCPTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]!._meta).toEqual({
      entitlement: 'config_override',
      tags: ['read'],
      version: 1,
      team: 'platform',
    });
  });
});
