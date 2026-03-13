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
    expect(body.result.content).toBeUndefined();
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
    expect(body.result.content).toBeUndefined();
  });

  it('extracts data by outputPath on tools/call', async () => {
    const pathSchema = buildSchema(`
      type Query { search(q: String!): SearchResult }
      type SearchResult { items: [String!]! }
    `);
    const pathRegistry = new ToolRegistry(
      [{
        name: 'search',
        query: 'query($q: String!) { search(q: $q) { items } }',
        output: { path: 'search.items' },
      }],
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
          query: 'query($q: String!, $limit: Int) { search(q: $q, limit: $limit) }',
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

    expect(
      body.result.tools[0].inputSchema.properties.name.description,
    ).toBe('The person to greet');
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
