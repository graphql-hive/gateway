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

  it('initialize advertises resources capability when resources are configured', async () => {
    const resourceOptions: MCPHandlerOptions = {
      ...options,
      resources: new Map([
        [
          'test://r',
          {
            name: 'r',
            uri: 'test://r',
            mimeType: 'text/plain',
            size: 2,
            text: 'hi',
          },
        ],
      ]),
    };
    const body = await callMCP(resourceOptions, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    });
    expect(body.result.capabilities.resources).toEqual({});
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('initialize omits resources capability when no resources configured', async () => {
    const body = await callMCP(options, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    });
    expect(body.result.capabilities.resources).toBeUndefined();
    expect(body.result.capabilities.tools).toBeDefined();
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

describe('resources/list', () => {
  const schema = buildSchema(`
    type Query { hello(name: String!): String }
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
  const options: MCPHandlerOptions = {
    serverName: 'test-mcp',
    serverVersion: '1.0.0',
    registry,
    execute: vi.fn(),
  };

  const resourceOptions: MCPHandlerOptions = {
    ...options,
    resources: new Map([
      [
        'docs://guide',
        {
          name: 'guide',
          uri: 'docs://guide',
          title: 'User Guide',
          description: 'How to use the system',
          mimeType: 'text/markdown',
          size: 13,
          text: '# User Guide',
          annotations: { audience: ['assistant' as const], priority: 0.8 },
        },
      ],
    ]),
  };

  it('returns resources with metadata', async () => {
    const body = await callMCP(resourceOptions, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list',
    });
    expect(body.result.resources).toHaveLength(1);
    expect(body.result.resources[0]).toMatchObject({
      uri: 'docs://guide',
      name: 'guide',
      title: 'User Guide',
      description: 'How to use the system',
      mimeType: 'text/markdown',
      size: 13,
      annotations: { audience: ['assistant'], priority: 0.8 },
    });
    // should NOT include content in list response
    expect(body.result.resources[0].content).toBeUndefined();
    expect(body.result.resources[0].text).toBeUndefined();
    expect(body.result.resources[0].blob).toBeUndefined();
  });

  it('returns empty array when no resources configured', async () => {
    const body = await callMCP(options, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list',
    });
    expect(body.result.resources).toEqual([]);
  });

  it('resolveResourceDescriptions overrides static description', async () => {
    const providerOptions: MCPHandlerOptions = {
      ...resourceOptions,
      resolveResourceDescriptions: vi.fn(async () => {
        return new Map([['docs://guide', 'Provider description']]);
      }),
    };
    const body = await callMCP(providerOptions, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list',
    });
    expect(body.result.resources[0].description).toBe('Provider description');
  });

  it('falls back to static description when resolveResourceDescriptions throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingOptions: MCPHandlerOptions = {
      ...resourceOptions,
      resolveResourceDescriptions: vi.fn(async () => {
        throw new Error('provider down');
      }),
    };
    const body = await callMCP(failingOptions, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list',
    });
    expect(body.result.resources).toHaveLength(1);
    expect(body.result.resources[0].description).toBe('How to use the system');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('provider down'),
    );
    warnSpy.mockRestore();
  });

  it('paginates with cursor and nextCursor', async () => {
    const paginatedOptions: MCPHandlerOptions = {
      ...options,
      resourcesListPageSize: 1,
      resources: new Map([
        [
          'r://a',
          {
            name: 'a',
            uri: 'r://a',
            mimeType: 'text/plain',
            size: 1,
            text: 'a',
          },
        ],
        [
          'r://b',
          {
            name: 'b',
            uri: 'r://b',
            mimeType: 'text/plain',
            size: 1,
            text: 'b',
          },
        ],
        [
          'r://c',
          {
            name: 'c',
            uri: 'r://c',
            mimeType: 'text/plain',
            size: 1,
            text: 'c',
          },
        ],
      ]),
    };

    // First page
    const body1 = await callMCP(paginatedOptions, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list',
    });
    expect(body1.result.resources).toHaveLength(1);
    expect(body1.result.resources[0].name).toBe('a');
    expect(body1.result.nextCursor).toBe('1');

    // Second page
    const body2 = await callMCP(paginatedOptions, {
      jsonrpc: '2.0',
      id: 2,
      method: 'resources/list',
      params: { cursor: '1' },
    });
    expect(body2.result.resources).toHaveLength(1);
    expect(body2.result.resources[0].name).toBe('b');
    expect(body2.result.nextCursor).toBe('2');

    // Last page
    const body3 = await callMCP(paginatedOptions, {
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/list',
      params: { cursor: '2' },
    });
    expect(body3.result.resources).toHaveLength(1);
    expect(body3.result.resources[0].name).toBe('c');
    expect(body3.result.nextCursor).toBeUndefined();
  });

  it('returns all resources when no pageSize configured', async () => {
    const body = await callMCP(resourceOptions, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list',
    });
    expect(body.result.resources).toHaveLength(1);
    expect(body.result.nextCursor).toBeUndefined();
  });

  it('returns error for invalid cursor', async () => {
    const paginatedOptions: MCPHandlerOptions = {
      ...options,
      resourcesListPageSize: 10,
      resources: new Map([
        [
          'r://a',
          {
            name: 'a',
            uri: 'r://a',
            mimeType: 'text/plain',
            size: 1,
            text: 'a',
          },
        ],
      ]),
    };

    for (const badCursor of ['garbage', '-1', '999']) {
      const body = await callMCP(paginatedOptions, {
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/list',
        params: { cursor: badCursor },
      });
      expect(body.error.code).toBe(-32602);
      expect(body.error.message).toContain('Invalid cursor');
      expect(body.result).toBeUndefined();
    }
  });
});

describe('resources/read', () => {
  const schema = buildSchema(`
    type Query { hello(name: String!): String }
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
  const options: MCPHandlerOptions = {
    serverName: 'test-mcp',
    serverVersion: '1.0.0',
    registry,
    execute: vi.fn(),
  };

  const resourceOptions: MCPHandlerOptions = {
    ...options,
    resources: new Map([
      [
        'docs://guide',
        {
          name: 'guide',
          uri: 'docs://guide',
          mimeType: 'text/markdown',
          size: 13,
          text: '# User Guide',
        },
      ],
    ]),
  };

  it('returns resource contents by URI', async () => {
    const body = await callMCP(resourceOptions, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'docs://guide' },
    });
    expect(body.result.contents).toEqual([
      {
        uri: 'docs://guide',
        mimeType: 'text/markdown',
        text: '# User Guide',
      },
    ]);
  });

  it('returns error -32602 when uri parameter is missing', async () => {
    const body = await callMCP(resourceOptions, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: {},
    });
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toBe('Missing required parameter: uri');
  });

  it('returns error -32002 for unknown URI', async () => {
    const body = await callMCP(resourceOptions, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'docs://nonexistent' },
    });
    expect(body.error.code).toBe(-32002);
    expect(body.error.message).toBe('Resource not found');
    expect(body.error.data).toEqual({ uri: 'docs://nonexistent' });
  });

  it('returns blob for binary resources', async () => {
    const b64 = Buffer.from('binary data').toString('base64');
    const blobOptions: MCPHandlerOptions = {
      ...options,
      resources: new Map([
        [
          'files://icon.png',
          {
            name: 'icon',
            uri: 'files://icon.png',
            mimeType: 'image/png',
            size: 11,
            blob: b64,
          },
        ],
      ]),
    };
    const body = await callMCP(blobOptions, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'files://icon.png' },
    });
    expect(body.result.contents).toEqual([
      {
        uri: 'files://icon.png',
        mimeType: 'image/png',
        blob: b64,
      },
    ]);
    // Should NOT have text field
    expect(body.result.contents[0].text).toBeUndefined();
  });
});

describe('resources/templates/list', () => {
  const schema = buildSchema(`
    type Query { hello(name: String!): String }
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
  const options: MCPHandlerOptions = {
    serverName: 'test-mcp',
    serverVersion: '1.0.0',
    registry,
    execute: vi.fn(),
  };

  it('returns resource templates', async () => {
    const opts: MCPHandlerOptions = {
      ...options,
      resourceTemplates: [
        {
          uriTemplate: 'docs://schemas/{name}',
          name: 'Schema',
          title: 'Schema Browser',
          description: 'Browse schemas by name',
          mimeType: 'text/graphql',
          pattern: /^docs:\/\/schemas\/(?<name>[^/]+)$/,
          paramNames: ['name'],
          handler: () => ({ text: 'schema' }),
        },
      ],
    };
    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/templates/list',
    });
    expect(body.result.resourceTemplates).toHaveLength(1);
    expect(body.result.resourceTemplates[0]).toMatchObject({
      uriTemplate: 'docs://schemas/{name}',
      name: 'Schema',
      title: 'Schema Browser',
      description: 'Browse schemas by name',
      mimeType: 'text/graphql',
    });
  });

  it('returns empty array when no templates configured', async () => {
    const body = await callMCP(options, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/templates/list',
    });
    expect(body.result.resourceTemplates).toEqual([]);
  });
});

describe('resources/read with templates', () => {
  const schema = buildSchema(`
    type Query { hello(name: String!): String }
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

  it('falls back to template when static resource not found', async () => {
    const opts: MCPHandlerOptions = {
      serverName: 'test-mcp',
      serverVersion: '1.0.0',
      registry,
      execute: vi.fn(),
      resources: new Map(),
      resourceTemplates: [
        {
          uriTemplate: 'docs://schemas/{name}',
          name: 'Schema',
          mimeType: 'text/graphql',
          pattern: /^docs:\/\/schemas\/(?<name>[^/]+)$/,
          paramNames: ['name'],
          handler: (params) => ({ text: `type ${params['name']} { id: ID! }` }),
        },
      ],
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'docs://schemas/User' },
    });
    expect(body.result.contents).toEqual([
      {
        uri: 'docs://schemas/User',
        mimeType: 'text/graphql',
        text: 'type User { id: ID! }',
      },
    ]);
  });

  it('static resource takes priority over template', async () => {
    const opts: MCPHandlerOptions = {
      serverName: 'test-mcp',
      serverVersion: '1.0.0',
      registry,
      execute: vi.fn(),
      resources: new Map([
        [
          'docs://schemas/User',
          {
            name: 'user-schema',
            uri: 'docs://schemas/User',
            mimeType: 'text/graphql',
            size: 6,
            text: 'static',
          },
        ],
      ]),
      resourceTemplates: [
        {
          uriTemplate: 'docs://schemas/{name}',
          name: 'Schema',
          mimeType: 'text/graphql',
          pattern: /^docs:\/\/schemas\/(?<name>[^/]+)$/,
          paramNames: ['name'],
          handler: () => ({ text: 'from template' }),
        },
      ],
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'docs://schemas/User' },
    });
    expect(body.result.contents[0].text).toBe('static');
  });

  it('returns error when handler throws', async () => {
    const opts: MCPHandlerOptions = {
      serverName: 'test-mcp',
      serverVersion: '1.0.0',
      registry,
      execute: vi.fn(),
      resourceTemplates: [
        {
          uriTemplate: 'docs://{name}',
          name: 'Doc',
          pattern: /^docs:\/\/(?<name>[^/]+)$/,
          paramNames: ['name'],
          handler: () => {
            throw new Error('not available');
          },
        },
      ],
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'docs://missing' },
    });
    expect(body.error.code).toBe(-32002);
    expect(body.error.message).toBe('Resource handler failed');
    expect(body.error.data.error).toBe('not available');
  });

  it('handler can return blob content', async () => {
    const b64 = Buffer.from('binary').toString('base64');
    const opts: MCPHandlerOptions = {
      serverName: 'test-mcp',
      serverVersion: '1.0.0',
      registry,
      execute: vi.fn(),
      resourceTemplates: [
        {
          uriTemplate: 'files://{name}',
          name: 'File',
          mimeType: 'application/octet-stream',
          pattern: /^files:\/\/(?<name>[^/]+)$/,
          paramNames: ['name'],
          handler: () => ({ blob: b64 }),
        },
      ],
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'files://test.bin' },
    });
    expect(body.result.contents[0].blob).toBe(b64);
    expect(body.result.contents[0].text).toBeUndefined();
  });

  it('handler can override mimeType', async () => {
    const opts: MCPHandlerOptions = {
      serverName: 'test-mcp',
      serverVersion: '1.0.0',
      registry,
      execute: vi.fn(),
      resourceTemplates: [
        {
          uriTemplate: 'docs://{name}',
          name: 'Doc',
          mimeType: 'text/plain',
          pattern: /^docs:\/\/(?<name>[^/]+)$/,
          paramNames: ['name'],
          handler: () => ({ text: '# Hello', mimeType: 'text/markdown' }),
        },
      ],
    };

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'docs://readme' },
    });
    expect(body.result.contents[0].mimeType).toBe('text/markdown');
  });

  it('returns error when handler returns unexpected shape', async () => {
    const opts: MCPHandlerOptions = {
      serverName: 'test-mcp',
      serverVersion: '1.0.0',
      registry: new ToolRegistry(
        [
          {
            name: 'say_hello',
            query: 'query($name: String!) { hello(name: $name) }',
          },
        ],
        buildSchema('type Query { hello(name: String!): String }'),
      ),
      execute: vi.fn(),
      resourceTemplates: [
        {
          uriTemplate: 'docs://{name}',
          name: 'Doc',
          pattern: /^docs:\/\/(?<name>[^/]+)$/,
          paramNames: ['name'],
          handler: (() => ({ data: 'oops' })) as any,
        },
      ],
    };
    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'docs://test' },
    });
    expect(body.error.code).toBe(-32603);
    expect(body.error.message).toContain('neither text nor blob');
  });
});

describe('resources/templates/list description providers', () => {
  const schema = buildSchema('type Query { hello(name: String!): String }');
  const registry = new ToolRegistry(
    [
      {
        name: 'say_hello',
        query: 'query($name: String!) { hello(name: $name) }',
      },
    ],
    schema,
  );
  const baseOptions: MCPHandlerOptions = {
    serverName: 'test-mcp',
    serverVersion: '1.0.0',
    registry,
    execute: vi.fn(),
    resourceTemplates: [
      {
        uriTemplate: 'docs://{name}',
        name: 'Doc',
        description: 'Static description',
        pattern: /^docs:\/\/(?<name>[^/]+)$/,
        paramNames: ['name'],
        handler: () => ({ text: 'hi' }),
      },
    ],
  };

  it('resolveTemplateDescriptions overrides static description', async () => {
    const opts: MCPHandlerOptions = {
      ...baseOptions,
      resolveTemplateDescriptions: vi.fn(async () => {
        return new Map([['docs://{name}', 'Provider description']]);
      }),
    };
    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/templates/list',
    });
    expect(body.result.resourceTemplates[0].description).toBe(
      'Provider description',
    );
  });

  it('falls back to static description when resolveTemplateDescriptions throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opts: MCPHandlerOptions = {
      ...baseOptions,
      resolveTemplateDescriptions: vi.fn(async () => {
        throw new Error('provider down');
      }),
    };
    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/templates/list',
    });
    expect(body.result.resourceTemplates[0].description).toBe(
      'Static description',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('provider down'),
    );
    warnSpy.mockRestore();
  });
});

describe('JSON-RPC validation', () => {
  const schema = buildSchema(`type Query { hello: String }`);
  const registry = new ToolRegistry(
    [{ name: 'hi', query: '{ hello }' }],
    schema,
  );
  const opts: MCPHandlerOptions = {
    serverName: 'test',
    serverVersion: '1.0.0',
    registry,
    execute: vi.fn(),
  };

  it('rejects request with missing jsonrpc field', async () => {
    const body = await handleMCPRequest(
      { id: 1, method: 'initialize' } as any,
      opts,
    );
    expect(body!.error!.code).toBe(-32600);
    expect(body!.error!.message).toContain('jsonrpc');
  });

  it('rejects request with wrong jsonrpc version', async () => {
    const body = await handleMCPRequest(
      { jsonrpc: '1.0' as any, id: 1, method: 'initialize' },
      opts,
    );
    expect(body!.error!.code).toBe(-32600);
  });

  it('rejects request with missing method', async () => {
    const body = await handleMCPRequest({ jsonrpc: '2.0', id: 1 } as any, opts);
    expect(body!.error!.code).toBe(-32600);
    expect(body!.error!.message).toContain('method');
  });

  it('rejects non-notification request with missing id', async () => {
    const body = await handleMCPRequest(
      { jsonrpc: '2.0', method: 'tools/list' } as any,
      opts,
    );
    expect(body!.error!.code).toBe(-32600);
    expect(body!.error!.message).toContain('id');
  });

  it('allows notification without id', async () => {
    const body = await handleMCPRequest(
      { jsonrpc: '2.0', method: 'notifications/initialized' } as any,
      opts,
    );
    expect(body).toBeNull();
  });

  it('returns error for unknown method', async () => {
    const body = await handleMCPRequest(
      { jsonrpc: '2.0', id: 1, method: 'unknown/method' },
      opts,
    );
    expect(body!.error!.code).toBe(-32601);
    expect(body!.error!.message).toContain('Method not found');
  });
});
