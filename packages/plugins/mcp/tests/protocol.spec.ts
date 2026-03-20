import { buildSchema } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import {
  handleMCPRequest,
  type JsonRpcRequest,
  type MCPHandlerOptions,
} from '../src/protocol.js';
import { ToolRegistry } from '../src/registry.js';

async function callMCP(
  opts: MCPHandlerOptions,
  body: JsonRpcRequest,
): Promise<any> {
  const result = await handleMCPRequest(body, opts);
  return result;
}

describe('handleMCPRequest', () => {
  const schema = buildSchema(`
    type Query {
      hello(name: String!): String
    }
  `);

  const registry = new ToolRegistry(
    [
      {
        name: 'say_hello',
        query: 'query($name: String!) { hello(name: $name) }',
      },
    ],
    schema,
  );

  const mockExecute = vi.fn().mockResolvedValue({ data: { hello: 'world' } });

  const options: MCPHandlerOptions = {
    serverName: 'test-mcp',
    serverVersion: '1.0.0',
    registry,
    execute: mockExecute,
  };

  it('handles initialize request', async () => {
    const body = await callMCP(options, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    expect(body.result.protocolVersion).toBe('2025-11-25');
    expect(body.result.serverInfo.name).toBe('test-mcp');
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('uses custom protocolVersion when provided', async () => {
    const opts = {
      ...options,
      protocolVersion: '2024-11-05',
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    expect(body.result.protocolVersion).toBe('2024-11-05');
  });

  it('includes serverTitle and instructions in initialize response when provided', async () => {
    const opts = {
      ...options,
      serverTitle: 'Weather API',
      instructions: 'Use the weather tools to get forecasts.',
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    expect(body.result.serverInfo.title).toBe('Weather API');
    expect(body.result.instructions).toBe(
      'Use the weather tools to get forecasts.',
    );
  });

  it('omits serverTitle and instructions from initialize response when not provided', async () => {
    const body = await callMCP(options, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    expect(body.result.serverInfo.title).toBeUndefined();
    expect(body.result.instructions).toBeUndefined();
  });

  it('handles tools/list request', async () => {
    const body = await callMCP(options, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    expect(body.result.tools).toHaveLength(1);
    expect(body.result.tools[0].name).toBe('say_hello');
  });

  it('tools/list returns all tools when no pageSize configured', async () => {
    const body = await callMCP(options, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    expect(body.result.tools).toHaveLength(1);
    expect(body.result.nextCursor).toBeUndefined();
  });

  it('tools/list paginates with cursor and nextCursor', async () => {
    const paginationSchema = buildSchema(`
      type Query {
        a(x: String!): String
        b(x: String!): String
        c(x: String!): String
      }
    `);
    const paginationRegistry = new ToolRegistry(
      [
        { name: 'tool_a', query: 'query($x: String!) { a(x: $x) }' },
        { name: 'tool_b', query: 'query($x: String!) { b(x: $x) }' },
        { name: 'tool_c', query: 'query($x: String!) { c(x: $x) }' },
      ],
      paginationSchema,
    );
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: paginationRegistry,
      execute: vi.fn(),
      toolsListPageSize: 2,
    };

    // First page
    const body1 = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(body1.result.tools).toHaveLength(2);
    expect(body1.result.tools[0].name).toBe('tool_a');
    expect(body1.result.tools[1].name).toBe('tool_b');
    expect(body1.result.nextCursor).toBe('2');

    // Second page
    const body2 = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { cursor: '2' },
    });
    expect(body2.result.tools).toHaveLength(1);
    expect(body2.result.tools[0].name).toBe('tool_c');
    expect(body2.result.nextCursor).toBeUndefined();
  });

  it('tools/list returns error for invalid cursor', async () => {
    const paginationSchema = buildSchema(
      `type Query { a(x: String!): String }`,
    );
    const paginationRegistry = new ToolRegistry(
      [{ name: 'tool_a', query: 'query($x: String!) { a(x: $x) }' }],
      paginationSchema,
    );
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: paginationRegistry,
      execute: vi.fn(),
      toolsListPageSize: 10,
    };

    for (const badCursor of ['garbage', '-1', '999']) {
      const body = await callMCP(opts, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: { cursor: badCursor },
      });
      expect(body.error.code).toBe(-32602);
      expect(body.error.message).toContain('Invalid cursor');
      expect(body.result).toBeUndefined();
    }
  });

  it('throws on toolsListPageSize of 0', async () => {
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry,
      execute: vi.fn(),
      toolsListPageSize: 0,
    };

    await expect(
      callMCP(opts, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    ).rejects.toThrow('toolsListPageSize must be a positive integer');
  });

  it('throws on negative toolsListPageSize', async () => {
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry,
      execute: vi.fn(),
      toolsListPageSize: -1,
    };

    await expect(
      callMCP(opts, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    ).rejects.toThrow('toolsListPageSize must be a positive integer');
  });

  it('handles tools/call request and executes GraphQL', async () => {
    const body = await callMCP(options, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'say_hello',
        arguments: { name: 'World' },
      },
    });

    expect(mockExecute).toHaveBeenCalledWith('say_hello', { name: 'World' });
    expect(body.result.structuredContent).toBeDefined();
    expect(body.result.content).toBeDefined();
  });

  it('includes structuredContent when tool has outputSchema', async () => {
    const schemaWithOutput = buildSchema(`
      type Query { getWeather(location: String!): Weather }
      type Weather { temperature: Float! }
    `);
    const registryWithOutput = new ToolRegistry(
      [
        {
          name: 'get_weather',
          query:
            'query($location: String!) { getWeather(location: $location) { temperature } }',
        },
      ],
      schemaWithOutput,
    );
    const executeResult = { data: { getWeather: { temperature: 72 } } };
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: registryWithOutput,
      execute: vi.fn().mockResolvedValue(executeResult),
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'get_weather', arguments: { location: 'NYC' } },
    });

    expect(body.result.structuredContent).toEqual(executeResult);
    expect(body.result.content).toBeDefined();
  });

  it('includes content annotations when configured', async () => {
    const annotSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const annotRegistry = new ToolRegistry(
      [
        {
          name: 'say_hello',
          query: 'query($name: String!) { hello(name: $name) }',
          output: {
            contentAnnotations: {
              audience: ['assistant'],
              priority: 0.8,
            },
          },
        },
      ],
      annotSchema,
    );
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: annotRegistry,
      execute: vi.fn().mockResolvedValue({ hello: 'world' }),
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'say_hello', arguments: { name: 'World' } },
    });

    expect(body.result.content[0].annotations).toEqual({
      audience: ['assistant'],
      priority: 0.8,
    });
  });

  it('omits content annotations when not configured', async () => {
    const body = await callMCP(options, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'say_hello', arguments: { name: 'World' } },
    });

    expect(body.result.content[0].annotations).toBeUndefined();
  });

  it('extracts data by outputPath on tools/call', async () => {
    const pathSchema = buildSchema(`
      type Query { search(q: String!): SearchResult }
      type SearchResult { items: [String!]! }
    `);
    const pathRegistry = new ToolRegistry(
      [
        {
          name: 'search',
          query: 'query($q: String!) { search(q: $q) { items } }',
          output: { path: 'search.items' },
        },
      ],
      pathSchema,
    );
    const pathExecute = vi.fn().mockResolvedValue({
      search: { items: ['a', 'b', 'c'] },
    });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: pathRegistry,
      execute: pathExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: { name: 'search', arguments: { q: 'test' } },
    });

    // Should return just the extracted array, not the full nested object
    expect(body.result.structuredContent).toEqual(['a', 'b', 'c']);
  });

  it('returns error for unknown tool', async () => {
    const body = await callMCP(options, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'unknown_tool',
        arguments: {},
      },
    });

    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain('unknown_tool');
    expect(body.result).toBeUndefined();
  });

  it('de-aliases arguments before executing', async () => {
    const aliasSchema = buildSchema(`
      type Query { search(q: String!): String }
    `);
    const aliasRegistry = new ToolRegistry(
      [
        {
          name: 'search',
          query: 'query($q: String!) { search(q: $q) }',
          input: {
            schema: {
              properties: {
                q: { alias: 'searchQuery' },
              },
            },
          },
        },
      ],
      aliasSchema,
    );
    const aliasExecute = vi.fn().mockResolvedValue({ search: 'results' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: aliasRegistry,
      execute: aliasExecute,
    };

    await callMCP(opts, {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'search', arguments: { searchQuery: 'hello' } },
    });
    // Should call execute with original variable name
    expect(aliasExecute).toHaveBeenCalledWith('search', { q: 'hello' });
  });

  it('de-aliases mixed aliased and non-aliased arguments', async () => {
    const mixedSchema = buildSchema(`
      type Query { search(q: String!, limit: Int): String }
    `);
    const mixedRegistry = new ToolRegistry(
      [
        {
          name: 'search',
          query:
            'query($q: String!, $limit: Int) { search(q: $q, limit: $limit) }',
          input: {
            schema: {
              properties: {
                q: { alias: 'searchQuery' },
              },
            },
          },
        },
      ],
      mixedSchema,
    );
    const mixedExecute = vi.fn().mockResolvedValue({ search: 'results' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: mixedRegistry,
      execute: mixedExecute,
    };

    await callMCP(opts, {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: { searchQuery: 'hello', limit: 10 },
      },
    });

    // searchQuery should be de-aliased to q, limit should pass through
    expect(mixedExecute).toHaveBeenCalledWith('search', {
      q: 'hello',
      limit: 10,
    });
  });

  it('resolves per-field descriptions from providers', async () => {
    const opts = {
      ...options,
      resolveFieldDescriptions: async () => {
        const map = new Map<string, Map<string, string>>();
        map.set('say_hello', new Map([['name', 'The person to greet']]));
        return map;
      },
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/list',
      params: {},
    });

    expect(body.result.tools[0].inputSchema.properties.name.description).toBe(
      'The person to greet',
    );
  });

  it('warns when resolveFieldDescriptions returns a field not in inputSchema', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opts = {
      ...options,
      resolveFieldDescriptions: async () => {
        const map = new Map<string, Map<string, string>>();
        map.set('say_hello', new Map([['nonExistentField', 'some desc']]));
        return map;
      },
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/list',
      params: {},
    });

    expect(body.result.tools).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('nonExistentField'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Available properties'),
    );
    warnSpy.mockRestore();
  });

  it('preprocess hook short-circuits execution when returning a value', async () => {
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'gated_tool',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            preprocess: (args) => {
              if (!args['_confirmed']) {
                return {
                  confirmationRequired: true,
                  message: `Confirm for ${args['name']}?`,
                };
              }
              return undefined;
            },
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({ hello: 'world' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 100,
      method: 'tools/call',
      params: { name: 'gated_tool', arguments: { name: 'Alice' } },
    });

    expect(hookExecute).not.toHaveBeenCalled();
    expect(body.result.content[0].text).toContain('confirmationRequired');
    expect(body.result.content[0].text).toContain('Alice');
  });

  it('preprocess hook returning undefined continues normal execution', async () => {
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'passthrough_tool',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            preprocess: () => undefined,
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({ hello: 'world' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 101,
      method: 'tools/call',
      params: { name: 'passthrough_tool', arguments: { name: 'Bob' } },
    });

    expect(hookExecute).toHaveBeenCalledWith('passthrough_tool', {
      name: 'Bob',
    });
    // Even though preprocess passed through, hooks are configured so no structuredContent
    expect(body.result.structuredContent).toBeUndefined();
    expect(body.result.content[0].text).toContain('hello');
  });

  it('postprocess hook transforms execution result', async () => {
    const hookSchema = buildSchema(`
      type Query { search(q: String!): SearchResult }
      type SearchResult { items: [Item!]! }
      type Item { title: String! url: String! }
    `);
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'search',
          query: 'query($q: String!) { search(q: $q) { items { title url } } }',
          hooks: {
            postprocess: (result) => {
              const data = result as {
                search: { items: { title: string; url: string }[] };
              };
              return data.search.items
                .map((i) => `- [${i.title}](${i.url})`)
                .join('\n');
            },
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({
      search: { items: [{ title: 'Doc', url: 'https://example.com' }] },
    });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'search', arguments: { q: 'test' } },
    });

    expect(body.result.content[0].text).toContain(
      '- [Doc](https://example.com)',
    );
  });

  it('postprocess hook returning raw MCP result is passed through directly', async () => {
    const hookSchema = buildSchema(`
      type Query { search(q: String!): SearchResult }
      type SearchResult { items: [Item!]! }
      type Item { title: String! url: String! }
    `);
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'search_mcp',
          query: 'query($q: String!) { search(q: $q) { items { title url } } }',
          hooks: {
            postprocess: (result, args) => {
              const data = result as {
                search: { items: { title: string; url: string }[] };
              };
              const rows = data.search.items
                .map((i) => `| ${i.title} | ${i.url} |`)
                .join('\n');
              return {
                content: [{ type: 'text', text: `| Title | URL |\n${rows}` }],
                _metadata: {
                  query: args['q'],
                  source: 'test',
                },
              };
            },
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({
      search: { items: [{ title: 'Doc', url: 'https://example.com' }] },
    });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'search_mcp', arguments: { q: 'test' } },
    });

    // Raw MCP result passed through — not wrapped in JSON.stringify
    expect(body.result.content[0].text).toBe(
      '| Title | URL |\n| Doc | https://example.com |',
    );
    expect(body.result._metadata).toEqual({
      query: 'test',
      source: 'test',
    });
  });

  it('preprocess hook returning raw MCP result is passed through directly', async () => {
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'mcp_gate',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            preprocess: (args) => ({
              content: [
                {
                  type: 'text',
                  text: `Confirm action for ${args['name']}?`,
                },
              ],
              _confirmationRequired: true,
            }),
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn();
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'mcp_gate', arguments: { name: 'Alice' } },
    });

    expect(hookExecute).not.toHaveBeenCalled();
    expect(body.result.content[0].text).toBe('Confirm action for Alice?');
    expect(body.result._confirmationRequired).toBe(true);
  });

  it('hook returning raw MCP result with isError: true passes through', async () => {
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'error_hook',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            postprocess: () => ({
              content: [{ type: 'text', text: 'Something went wrong' }],
              isError: true,
            }),
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({ hello: 'world' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'error_hook', arguments: { name: 'test' } },
    });

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toBe('Something went wrong');
  });

  it('does not misclassify GraphQL data with a content field as raw MCP result', async () => {
    const cmsSchema = buildSchema(`
      type Query { getPage(id: ID!): Page }
      type Page { title: String! content: [Block!]! }
      type Block { type: String! text: String }
    `);
    const cmsRegistry = new ToolRegistry(
      [
        {
          name: 'get_page',
          query:
            'query($id: ID!) { getPage(id: $id) { title content { type text } } }',
          output: { path: 'getPage' },
        },
      ],
      cmsSchema,
    );
    const cmsExecute = vi.fn().mockResolvedValue({
      getPage: {
        title: 'Hello',
        content: [{ type: 'paragraph', text: 'World' }],
      },
    });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: cmsRegistry,
      execute: cmsExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'get_page', arguments: { id: '1' } },
    });

    // Should be wrapped as structuredContent, NOT passed through as raw MCP result
    expect(body.result.structuredContent).toEqual({
      title: 'Hello',
      content: [{ type: 'paragraph', text: 'World' }],
    });
  });

  it('does not treat hook result with empty content array as raw MCP result', async () => {
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'empty_content',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            postprocess: () => ({ content: [] }),
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({ hello: 'world' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'empty_content', arguments: { name: 'test' } },
    });

    // Empty content array is NOT a valid MCP result — should be wrapped as text
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed).toEqual({ content: [] });
  });

  it('does not treat hook result with non-MCP content types as raw MCP result', async () => {
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'bad_content_type',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            postprocess: () => ({
              content: [{ type: 'paragraph', text: 'not MCP' }],
            }),
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({ hello: 'world' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'bad_content_type', arguments: { name: 'test' } },
    });

    // Non-MCP content types should be wrapped as text, not passed through
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed).toEqual({
      content: [{ type: 'paragraph', text: 'not MCP' }],
    });
  });

  it('applies output.path before postprocess', async () => {
    const hookSchema = buildSchema(`
      type Query { search(q: String!): SearchResult }
      type SearchResult { items: [String!]! }
    `);
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'search_extract',
          query: 'query($q: String!) { search(q: $q) { items } }',
          output: { path: 'search.items' },
          hooks: {
            postprocess: (result) => {
              // result should already be the extracted array from output.path
              return (result as string[]).map((s) => s.toUpperCase());
            },
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({
      search: { items: ['hello', 'world'] },
    });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 103,
      method: 'tools/call',
      params: { name: 'search_extract', arguments: { q: 'test' } },
    });

    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed).toEqual(['HELLO', 'WORLD']);
  });

  it('returns MCP error when preprocess hook throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'error_tool',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            preprocess: () => {
              throw new Error('preprocess failed');
            },
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn();
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 104,
      method: 'tools/call',
      params: { name: 'error_tool', arguments: { name: 'test' } },
    });

    expect(hookExecute).not.toHaveBeenCalled();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('preprocess hook failed');
    expect(body.result.content[0].text).toContain('preprocess failed');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('error_tool'),
      expect.stringContaining('preprocess hook failed'),
    );
    errorSpy.mockRestore();
  });

  it('returns MCP error when postprocess hook throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'post_error_tool',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            postprocess: () => {
              throw new Error('postprocess failed');
            },
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({ hello: 'world' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 105,
      method: 'tools/call',
      params: { name: 'post_error_tool', arguments: { name: 'test' } },
    });

    expect(hookExecute).toHaveBeenCalled();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('postprocess hook failed');
    expect(body.result.content[0].text).toContain('postprocess failed');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('post_error_tool'),
      expect.stringContaining('postprocess hook failed'),
    );
    errorSpy.mockRestore();
  });

  it('passes headers and query in hook context', async () => {
    const contextSpy = vi.fn().mockReturnValue(undefined);
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookQuery = 'query($name: String!) { hello(name: $name) }';
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'context_tool',
          query: hookQuery,
          hooks: { preprocess: contextSpy },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({ hello: 'world' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
      requestContext: {
        headers: { authorization: 'Bearer token123' },
      },
    };

    await callMCP(opts, {
      jsonrpc: '2.0',
      id: 106,
      method: 'tools/call',
      params: { name: 'context_tool', arguments: { name: 'test' } },
    });

    expect(contextSpy).toHaveBeenCalledWith(
      { name: 'test' },
      {
        toolName: 'context_tool',
        headers: { authorization: 'Bearer token123' },
        query: hookQuery,
      },
    );
  });

  it('does not call postprocess when preprocess short-circuits', async () => {
    const postprocessSpy = vi.fn();
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'both_hooks_tool',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            preprocess: () => ({ shortCircuit: true }),
            postprocess: postprocessSpy,
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn();
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 110,
      method: 'tools/call',
      params: { name: 'both_hooks_tool', arguments: { name: 'test' } },
    });

    expect(hookExecute).not.toHaveBeenCalled();
    expect(postprocessSpy).not.toHaveBeenCalled();
    expect(body.result.content[0].text).toContain('shortCircuit');
    expect(body.result.structuredContent).toBeUndefined();
  });

  it('runs both preprocess (passthrough) and postprocess together', async () => {
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'both_hooks_passthrough',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            preprocess: () => undefined,
            postprocess: (result) => {
              const data = result as { hello: string };
              return { greeting: data.hello.toUpperCase() };
            },
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({ hello: 'world' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 111,
      method: 'tools/call',
      params: { name: 'both_hooks_passthrough', arguments: { name: 'Bob' } },
    });

    expect(hookExecute).toHaveBeenCalled();
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed).toEqual({ greeting: 'WORLD' });
    expect(body.result.structuredContent).toBeUndefined();
  });

  it('handles async preprocess hook that short-circuits', async () => {
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'async_preprocess',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            preprocess: async (args) => {
              return { async: true, name: args['name'] };
            },
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn();
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 112,
      method: 'tools/call',
      params: { name: 'async_preprocess', arguments: { name: 'test' } },
    });

    expect(hookExecute).not.toHaveBeenCalled();
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed).toEqual({ async: true, name: 'test' });
  });

  it('handles async postprocess hook rejection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hookSchema = buildSchema(
      `type Query { hello(name: String!): String }`,
    );
    const hookRegistry = new ToolRegistry(
      [
        {
          name: 'async_post_error',
          query: 'query($name: String!) { hello(name: $name) }',
          hooks: {
            postprocess: () =>
              Promise.reject(new Error('async postprocess failed')),
          },
        },
      ],
      hookSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({ hello: 'world' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 113,
      method: 'tools/call',
      params: { name: 'async_post_error', arguments: { name: 'test' } },
    });

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('async postprocess failed');
    errorSpy.mockRestore();
  });

  it('preprocess receives de-aliased args when aliases are configured', async () => {
    const preprocessSpy = vi.fn().mockReturnValue(undefined);
    const aliasSchema = buildSchema(`
      type Query { searchProducts(query: String!, category: String): String }
    `);
    const aliasRegistry = new ToolRegistry(
      [
        {
          name: 'alias_hook_tool',
          query:
            'query($query: String!, $category: String) { searchProducts(query: $query, category: $category) }',
          input: {
            schema: {
              properties: {
                query: { alias: 'searchQuery' },
              },
            },
          },
          hooks: { preprocess: preprocessSpy },
        },
      ],
      aliasSchema,
    );
    const hookExecute = vi.fn().mockResolvedValue({ searchProducts: 'result' });
    const opts = {
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: aliasRegistry,
      execute: hookExecute,
    };

    await callMCP(opts, {
      jsonrpc: '2.0',
      id: 114,
      method: 'tools/call',
      params: {
        name: 'alias_hook_tool',
        arguments: { searchQuery: 'test', category: 'docs' },
      },
    });

    // Should receive original GraphQL variable names, not aliases
    expect(preprocessSpy).toHaveBeenCalledWith(
      { query: 'test', category: 'docs' },
      expect.any(Object),
    );
  });

  it('tools/list succeeds when resolveFieldDescriptions throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opts = {
      ...options,
      resolveFieldDescriptions: async () => {
        throw new Error('provider down');
      },
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/list',
      params: {},
    });

    expect(body).not.toBeNull();
    expect(body.result.tools).toHaveLength(1);
    expect(body.result.tools[0].name).toBe('say_hello');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('provider down'),
    );
    warnSpy.mockRestore();
  });
});
