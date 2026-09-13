import {
  createGatewayRuntime,
  createLoggerFromLogging,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { buildSchema } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPMethodError, useMCP, type MCPMethodContext } from '../src/index.js';
import {
  handleMCPRequest,
  type CustomMethodDispatchContext,
  type JsonRpcRequest,
  type MCPHandlerOptions,
} from '../src/protocol.js';
import { ToolRegistry } from '../src/registry.js';

const logger = createLoggerFromLogging(false);

describe('custom method dispatch', () => {
  const schema = buildSchema(`
    type Query { hello(name: String!): String }
  `);
  const registry = new ToolRegistry(
    { log: logger },
    [
      {
        name: 'say_hello',
        query: 'query($name: String!) { hello(name: $name) }',
      },
    ],
    schema,
  );

  function makeOptions(
    overrides?: Partial<MCPHandlerOptions>,
  ): MCPHandlerOptions {
    return {
      serverName: 'test-mcp',
      serverVersion: '1.0.0',
      registry,
      ...overrides,
    };
  }

  async function callMCP(
    opts: MCPHandlerOptions,
    body: JsonRpcRequest,
    dispatchContext?: CustomMethodDispatchContext,
  ): Promise<any> {
    return handleMCPRequest(
      { log: logger },
      body,
      opts,
      undefined,
      dispatchContext,
    );
  }

  it('dispatches a custom method and wraps its return value as the result', async () => {
    const opts = makeOptions({
      customMethods: {
        'echo/params': (params) => ({ echoed: params }),
      },
    });

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 7,
      method: 'echo/params',
      params: { value: 42 },
    });

    expect(body).toEqual({
      jsonrpc: '2.0',
      id: 7,
      result: { echoed: { value: 42 } },
    });
  });

  it('passes method, requestId, logger, and transport in the handler context', async () => {
    let seen: MCPMethodContext | undefined;
    const opts = makeOptions({
      customMethods: {
        'inspect/context': (_params, context) => {
          seen = context;
          return null;
        },
      },
    });
    const request = new Request('http://localhost/mcp', { method: 'POST' });
    const dispatchContext: CustomMethodDispatchContext = {
      transport: {
        type: 'http',
        request,
        headers: { authorization: 'Bearer abc' },
      },
    };

    await callMCP(
      opts,
      { jsonrpc: '2.0', id: 'req-1', method: 'inspect/context' },
      dispatchContext,
    );

    expect(seen).toBeDefined();
    expect(seen!.method).toBe('inspect/context');
    expect(seen!.requestId).toBe('req-1');
    expect(seen!.logger).toBe(logger);
    expect(seen!.transport).toBe(dispatchContext.transport);
  });

  it('coerces a handler returning undefined to a null result', async () => {
    const opts = makeOptions({
      customMethods: { 'fire/and-forget': () => undefined },
    });

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 1,
      method: 'fire/and-forget',
    });

    expect(body.result).toBeNull();
    expect(body.error).toBeUndefined();
  });

  it('converts MCPMethodError into a JSON-RPC error response', async () => {
    const opts = makeOptions({
      customMethods: {
        'always/invalid': () => {
          throw new MCPMethodError(-32602, 'Invalid params: expected a list', {
            field: 'items',
          });
        },
      },
    });

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 2,
      method: 'always/invalid',
    });

    expect(body.result).toBeUndefined();
    expect(body.error).toEqual({
      code: -32602,
      message: 'Invalid params: expected a list',
      data: { field: 'items' },
    });
  });

  it('omits the error data field when MCPMethodError has no data', async () => {
    const opts = makeOptions({
      customMethods: {
        'always/failing': () => {
          throw new MCPMethodError(-32000, 'Not ready');
        },
      },
    });

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 3,
      method: 'always/failing',
    });

    expect(body.error.code).toBe(-32000);
    expect('data' in body.error).toBe(false);
  });

  it('lets non-MCPMethodError exceptions bubble to the caller', async () => {
    const opts = makeOptions({
      customMethods: {
        'always/throws': () => {
          throw new Error('boom');
        },
      },
    });

    await expect(
      callMCP(opts, { jsonrpc: '2.0', id: 4, method: 'always/throws' }),
    ).rejects.toThrow('boom');
  });

  it('returns no response for a custom notification handler', async () => {
    const received: unknown[] = [];
    const opts = makeOptions({
      customMethods: {
        'notifications/custom-ping': (params) => {
          received.push(params);
          return { ignored: true };
        },
      },
    });

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      method: 'notifications/custom-ping',
      params: { n: 1 },
    });

    expect(body).toBeNull();
    expect(received).toEqual([{ n: 1 }]);
  });

  it('suppresses the response for notification-named methods even when an id is sent', async () => {
    const opts = makeOptions({
      customMethods: {
        'notifications/custom-ping': () => ({ ignored: true }),
      },
    });

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 12,
      method: 'notifications/custom-ping',
    });

    expect(body).toBeNull();
  });

  it('swallows and logs errors thrown by custom notification handlers', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const opts = makeOptions({
      customMethods: {
        'notifications/custom-fail': () => {
          throw new Error('notification handler broke');
        },
      },
    });

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      method: 'notifications/custom-fail',
    });

    expect(body).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('notifications/custom-fail'),
      expect.stringContaining('notification handler broke'),
    );
    errorSpy.mockRestore();
  });

  it('throws a clear error when executeGraphQL is unavailable', async () => {
    const opts = makeOptions({
      customMethods: {
        'graphql/run': (_params, context) =>
          context.executeGraphQL({ query: '{ hello }' }),
      },
    });

    await expect(
      callMCP(opts, { jsonrpc: '2.0', id: 5, method: 'graphql/run' }),
    ).rejects.toThrow('GraphQL execution is not available');
  });

  it('throws a clear error when getSchema is unavailable', async () => {
    const opts = makeOptions({
      customMethods: {
        'schema/read': (_params, context) => {
          context.getSchema();
          return null;
        },
      },
    });

    await expect(
      callMCP(opts, { jsonrpc: '2.0', id: 6, method: 'schema/read' }),
    ).rejects.toThrow('Schema access is not available');
  });

  it('uses the bound executeGraphQL from the dispatch context', async () => {
    const execute = vi.fn(async () => ({ data: { hello: 'world' } }));
    const opts = makeOptions({
      customMethods: {
        'graphql/run': (_params, context) =>
          context.executeGraphQL({ query: '{ hello }' }),
      },
    });

    const body = await callMCP(
      opts,
      { jsonrpc: '2.0', id: 8, method: 'graphql/run' },
      { executeGraphQL: execute },
    );

    expect(execute).toHaveBeenCalledWith({ query: '{ hello }' });
    expect(body.result).toEqual({ data: { hello: 'world' } });
  });

  it('dispatches built-in methods ahead of custom methods', async () => {
    const shadow = vi.fn(() => ({ shadowed: true }));
    // Collisions are rejected at useMCP startup; this exercises the
    // dispatch-layer ordering directly as defense in depth.
    const opts = makeOptions({
      customMethods: { 'tools/list': shadow },
    });

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/list',
      params: {},
    });

    expect(shadow).not.toHaveBeenCalled();
    expect(body.result.tools).toHaveLength(1);
  });

  it('returns -32601 for unknown methods even when custom methods exist', async () => {
    const opts = makeOptions({
      customMethods: { 'echo/params': (params) => params },
    });

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 10,
      method: 'unknown/method',
    });

    expect(body.error.code).toBe(-32601);
  });

  it('returns -32601 for prototype-chain method names instead of dispatching inherited properties', async () => {
    const opts = makeOptions({
      customMethods: { 'echo/params': (params) => params },
    });

    for (const method of [
      'constructor',
      'toString',
      'hasOwnProperty',
      '__proto__',
    ]) {
      const body = await callMCP(opts, { jsonrpc: '2.0', id: 1, method });
      expect(body.error?.code, `method: ${method}`).toBe(-32601);
    }
  });

  it('merges customCapabilities into the initialize response', async () => {
    const opts = makeOptions({
      customCapabilities: { experimental: { echo: {} } },
    });

    const body = await callMCP(opts, {
      jsonrpc: '2.0',
      id: 11,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    });

    expect(body.result.capabilities.experimental).toEqual({ echo: {} });
    expect(body.result.capabilities.tools).toBeDefined();
  });
});

describe('useMCP customMethods validation', () => {
  it('throws at startup when a custom method collides with a built-in', () => {
    expect(() =>
      useMCP(
        { log: logger },
        {
          name: 'test',
          customMethods: { 'tools/list': () => null },
        },
      ),
    ).toThrow(/customMethods cannot override built-in methods: tools\/list/);
  });

  it('reserves tools/call even though it is dispatched at the HTTP layer', () => {
    expect(() =>
      useMCP(
        { log: logger },
        {
          name: 'test',
          customMethods: { 'tools/call': () => null },
        },
      ),
    ).toThrow(/tools\/call/);
  });

  it('throws at startup when a custom method is not a function', () => {
    expect(() =>
      useMCP(
        { log: logger },
        {
          name: 'test',
          customMethods: { 'echo/params': 'not a function' as any },
        },
      ),
    ).toThrow(/customMethods\["echo\/params"\] must be a function/);
  });

  it('throws at startup when customMethods is not a plain object', () => {
    expect(() =>
      useMCP({ log: logger }, { name: 'test', customMethods: [] as any }),
    ).toThrow(/customMethods must be an object/);
    expect(() =>
      useMCP({ log: logger }, { name: 'test', customMethods: 'nope' as any }),
    ).toThrow(/customMethods must be an object/);
  });

  it('throws at startup when customCapabilities is not a plain object', () => {
    expect(() =>
      useMCP({ log: logger }, { name: 'test', customCapabilities: [] as any }),
    ).toThrow(/customCapabilities must be an object/);
  });
});

describe('custom methods E2E through the gateway runtime', () => {
  let upstreamPings = 0;
  const upstream = createYoga({
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          ping: String
        }
      `,
      resolvers: {
        Query: {
          ping: () => {
            upstreamPings++;
            return 'pong';
          },
        },
      },
    }),
    logging: false,
  });

  let executeHookFired = false;
  let internalAuthHeader: string | null = null;

  const gateway = createGatewayRuntime({
    logging: false,
    proxy: {
      endpoint: 'http://upstream:4000/graphql',
    },
    plugins: (ctx) => [
      useCustomFetch(
        // @ts-expect-error MeshFetch type mismatch
        (url, init) => upstream.fetch(url, init),
      ),
      {
        onExecute() {
          executeHookFired = true;
        },
        onRequestParse({ request, url }: { request: Request; url: URL }) {
          if (url.pathname === '/graphql') {
            internalAuthHeader = request.headers.get('authorization');
          }
        },
      },
      useMCP(ctx, {
        name: 'test-gateway',
        version: '0.1.0',
        customCapabilities: { experimental: { graphql: {} } },
        customMethods: {
          'echo/params': (params) => ({ echoed: params }),
          'graphql/run': async (params, context) => {
            const { query } = params as { query?: string };
            if (typeof query !== 'string') {
              throw new MCPMethodError(
                -32602,
                'Invalid params: "query" must be a string',
              );
            }
            return context.executeGraphQL({ query });
          },
          'notifications/custom-ping': () => undefined,
        },
      }),
    ],
  });

  afterAll(() => gateway[Symbol.asyncDispose]?.());

  beforeEach(() => {
    executeHookFired = false;
    internalAuthHeader = null;
  });

  function mcpRequest(
    method: string,
    params: unknown = {},
    headers: Record<string, string> = {},
    id: number | string | null = 1,
  ) {
    const body: Record<string, unknown> = { jsonrpc: '2.0', method, params };
    if (id !== null) body['id'] = id;
    return gateway.fetch('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('round-trips a custom method over HTTP', async () => {
    const res = await mcpRequest('echo/params', { hello: 'mcp' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { echoed: { hello: 'mcp' } },
    });
  });

  it('advertises customCapabilities in initialize', async () => {
    const res = await mcpRequest('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' },
    });
    const body = await res.json();
    expect(body.result.capabilities.experimental).toEqual({ graphql: {} });
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('executes GraphQL through the full pipeline from a custom method', async () => {
    const before = upstreamPings;

    const res = await mcpRequest('graphql/run', { query: '{ ping }' });
    const body = await res.json();

    expect(body.result).toMatchObject({ data: { ping: 'pong' } });
    expect(upstreamPings).toBe(before + 1);
    expect(executeHookFired).toBe(true);
  });

  it('forwards request headers into internal GraphQL execution', async () => {
    await mcpRequest(
      'graphql/run',
      { query: '{ ping }' },
      { authorization: 'Bearer forwarded-token' },
    );

    expect(internalAuthHeader).toBe('Bearer forwarded-token');
  });

  it('surfaces MCPMethodError from a custom method as a JSON-RPC error', async () => {
    const res = await mcpRequest('graphql/run', { query: 42 });
    const body = await res.json();
    expect(body.error).toMatchObject({
      code: -32602,
      message: 'Invalid params: "query" must be a string',
    });
  });

  it('returns 204 for custom notification methods', async () => {
    const res = await mcpRequest('notifications/custom-ping', {}, {}, null);
    expect(res.status).toBe(204);
  });

  it('returns 204 for notification-named methods even when an id is sent', async () => {
    const res = await mcpRequest('notifications/custom-ping', {}, {}, 5);
    expect(res.status).toBe(204);
  });

  it('still returns -32601 for unknown methods', async () => {
    const res = await mcpRequest('does/not-exist');
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });
});

describe('non-JSON internal execution responses', () => {
  const upstream = createYoga({
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          ping: String
        }
      `,
      resolvers: { Query: { ping: () => 'pong' } },
    }),
    logging: false,
  });

  const gateway = createGatewayRuntime({
    logging: false,
    proxy: {
      endpoint: 'http://upstream:4000/graphql',
    },
    plugins: (ctx) => [
      useCustomFetch(
        // @ts-expect-error MeshFetch type mismatch
        (url, init) => upstream.fetch(url, init),
      ),
      {
        onRequestParse({
          url,
          endResponse,
          fetchAPI,
        }: {
          url: URL;
          endResponse: (response: Response) => void;
          fetchAPI: { Response: typeof Response };
        }) {
          if (url.pathname === '/graphql') {
            endResponse(
              new fetchAPI.Response('<html>auth required</html>', {
                status: 401,
                headers: { 'content-type': 'text/html' },
              }),
            );
          }
        },
      },
      useMCP(ctx, {
        name: 'test-gateway',
        customMethods: {
          'graphql/run': (_params, context) =>
            context.executeGraphQL({ query: '{ ping }' }),
        },
      }),
    ],
  });

  afterAll(() => gateway[Symbol.asyncDispose]?.());

  it('surfaces a clear error when internal execution returns non-JSON', async () => {
    const res = await gateway.fetch('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'graphql/run',
        params: {},
      }),
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32603);
    expect(body.error.message).toContain('non-JSON response');
    expect(body.error.message).toContain('401');
  });
});

describe('non-OK JSON internal execution responses', () => {
  const upstream = createYoga({
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          ping: String
        }
      `,
      resolvers: { Query: { ping: () => 'pong' } },
    }),
    logging: false,
  });

  const gateway = createGatewayRuntime({
    logging: false,
    proxy: {
      endpoint: 'http://upstream:4000/graphql',
    },
    plugins: (ctx) => [
      useCustomFetch(
        // @ts-expect-error MeshFetch type mismatch
        (url, init) => upstream.fetch(url, init),
      ),
      {
        onRequestParse({
          url,
          endResponse,
          fetchAPI,
        }: {
          url: URL;
          endResponse: (response: Response) => void;
          fetchAPI: { Response: typeof Response };
        }) {
          if (url.pathname === '/graphql') {
            endResponse(
              new fetchAPI.Response(
                JSON.stringify({ message: 'unauthorized' }),
                {
                  status: 401,
                  headers: { 'content-type': 'application/json' },
                },
              ),
            );
          }
        },
      },
      useMCP(ctx, {
        name: 'test-gateway',
        customMethods: {
          'graphql/run': (_params, context) =>
            context.executeGraphQL({ query: '{ ping }' }),
        },
      }),
    ],
  });

  afterAll(() => gateway[Symbol.asyncDispose]?.());

  it('surfaces non-OK JSON responses without GraphQL shape as errors', async () => {
    const res = await gateway.fetch('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'graphql/run',
        params: {},
      }),
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32603);
    expect(body.error.message).toContain('failed with status 401');
  });
});
