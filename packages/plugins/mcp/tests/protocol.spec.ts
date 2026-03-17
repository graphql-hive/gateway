import { buildSchema } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { createMCPHandler, type MCPHandlerOptions } from '../src/protocol.js';
import { ToolRegistry } from '../src/registry.js';

describe('createMCPHandler', () => {
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
    const handler = createMCPHandler(options);

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

    expect(body.result.serverInfo.name).toBe('test-mcp');
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('handles tools/list request', async () => {
    const handler = createMCPHandler(options);

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    const response = await handler(request);
    const body = await response.json();

    expect(body.result.tools).toHaveLength(1);
    expect(body.result.tools[0].name).toBe('say_hello');
  });

  it('handles tools/call request and executes GraphQL', async () => {
    const handler = createMCPHandler(options);

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'say_hello',
          arguments: { name: 'World' },
        },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: registryWithOutput,
      execute: vi.fn().mockResolvedValue(executeResult),
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'get_weather', arguments: { location: 'NYC' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

    expect(body.result.structuredContent).toEqual(executeResult);
    expect(body.result.content).toBeDefined();
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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: pathRegistry,
      execute: pathExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: { name: 'search', arguments: { q: 'test' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

    // Should return just the extracted array, not the full nested object
    expect(body.result.structuredContent).toEqual(['a', 'b', 'c']);
  });

  it('returns error for unknown tool', async () => {
    const handler = createMCPHandler(options);

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

    expect(body.result.isError).toBe(true);
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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: aliasRegistry,
      execute: aliasExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'search', arguments: { searchQuery: 'hello' } },
      }),
    });

    await handler(request);
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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: mixedRegistry,
      execute: mixedExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: { searchQuery: 'hello', limit: 10 },
        },
      }),
    });

    await handler(request);
    // searchQuery should be de-aliased to q, limit should pass through
    expect(mixedExecute).toHaveBeenCalledWith('search', {
      q: 'hello',
      limit: 10,
    });
  });

  it('resolves per-field descriptions from providers', async () => {
    const handler = createMCPHandler({
      ...options,
      resolveFieldDescriptions: async () => {
        const map = new Map<string, Map<string, string>>();
        map.set('say_hello', new Map([['name', 'The person to greet']]));
        return map;
      },
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/list',
        params: {},
      }),
    });

    const response = await handler(request);
    const body = await response.json();

    expect(body.result.tools[0].inputSchema.properties.name.description).toBe(
      'The person to greet',
    );
  });

  it('warns when resolveFieldDescriptions returns a field not in inputSchema', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = createMCPHandler({
      ...options,
      resolveFieldDescriptions: async () => {
        const map = new Map<string, Map<string, string>>();
        map.set('say_hello', new Map([['nonExistentField', 'some desc']]));
        return map;
      },
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/list',
        params: {},
      }),
    });

    const response = await handler(request);
    const body = await response.json();

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'tools/call',
        params: { name: 'gated_tool', arguments: { name: 'Alice' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 101,
        method: 'tools/call',
        params: { name: 'passthrough_tool', arguments: { name: 'Bob' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

    expect(hookExecute).toHaveBeenCalledWith('passthrough_tool', {
      name: 'Bob',
    });
    // Tool has outputSchema so result uses structuredContent format
    expect(body.result.structuredContent).toEqual({ hello: 'world' });
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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 102,
        method: 'tools/call',
        params: { name: 'search', arguments: { q: 'test' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

    expect(body.result.content[0].text).toContain(
      '- [Doc](https://example.com)',
    );
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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 103,
        method: 'tools/call',
        params: { name: 'search_extract', arguments: { q: 'test' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 104,
        method: 'tools/call',
        params: { name: 'error_tool', arguments: { name: 'test' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 105,
        method: 'tools/call',
        params: { name: 'post_error_tool', arguments: { name: 'test' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
      requestContext: {
        headers: { authorization: 'Bearer token123' },
      },
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 106,
        method: 'tools/call',
        params: { name: 'context_tool', arguments: { name: 'test' } },
      }),
    });

    await handler(request);

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 110,
        method: 'tools/call',
        params: { name: 'both_hooks_tool', arguments: { name: 'test' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 111,
        method: 'tools/call',
        params: { name: 'both_hooks_passthrough', arguments: { name: 'Bob' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 112,
        method: 'tools/call',
        params: { name: 'async_preprocess', arguments: { name: 'test' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: hookRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 113,
        method: 'tools/call',
        params: { name: 'async_post_error', arguments: { name: 'test' } },
      }),
    });

    const response = await handler(request);
    const body = await response.json();

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
    const handler = createMCPHandler({
      serverName: 'test',
      serverVersion: '1.0.0',
      registry: aliasRegistry,
      execute: hookExecute,
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 114,
        method: 'tools/call',
        params: {
          name: 'alias_hook_tool',
          arguments: { searchQuery: 'test', category: 'docs' },
        },
      }),
    });

    await handler(request);

    // Should receive original GraphQL variable names, not aliases
    expect(preprocessSpy).toHaveBeenCalledWith(
      { query: 'test', category: 'docs' },
      expect.any(Object),
    );
  });

  it('tools/list succeeds when resolveFieldDescriptions throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = createMCPHandler({
      ...options,
      resolveFieldDescriptions: async () => {
        throw new Error('provider down');
      },
    });

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/list',
        params: {},
      }),
    });

    const response = await handler(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.tools).toHaveLength(1);
    expect(body.result.tools[0].name).toBe('say_hello');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('provider down'),
    );
    warnSpy.mockRestore();
  });
});
