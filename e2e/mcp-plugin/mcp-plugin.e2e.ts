import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { describe, expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

async function mcpRequest(
  port: number,
  method: string,
  params: unknown = {},
  id: number | string = 1,
  headers: Record<string, string> = {},
): Promise<any> {
  const res = await fetch(`http://0.0.0.0:${port}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `MCP request "${method}" failed with HTTP ${res.status}: ${text}`,
    );
  }
  return res.json();
}

it('initialize returns protocol version and capabilities', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'initialize');
  expect(body).toMatchObject({
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2025-11-25',
      serverInfo: {
        name: 'mcp-e2e-gateway',
        version: '1.0.0',
      },
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  });
  expect(body.result.serverInfo.title).toBe('MCP E2E Test Gateway');
  expect(body.result.serverInfo.description).toBe(
    'Gateway for e2e testing of MCP features',
  );
});

it('tools/list returns all configured tools', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/list');
  const names = body.result.tools.map((t: any) => t.name).sort();
  expect(names).toEqual([
    'aliased_weather',
    'cancel_order',
    'field_provider_weather',
    'formatted_weather',
    'gated_weather',
    'get_forecast',
    'get_weather',
    'provider_weather',
    'quick_weather',
    'search_cities',
    'weather_field_provider',
  ]);
});

it('tools/list shows correct inputSchema and outputSchema', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/list');
  const weather = body.result.tools.find(
    (t: any) => t.name === 'get_weather',
  );

  expect(weather.title).toBe('Current Weather');
  expect(weather.inputSchema).toMatchObject({
    type: 'object',
    properties: { location: { type: 'string' } },
    required: ['location'],
  });
  expect(weather.outputSchema).toBeDefined();
});

it('tools/call executes inline tool and returns structured data', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/call', {
    name: 'get_weather',
    arguments: { location: 'London' },
  });
  expect(body.result.isError).toBe(false);
  expect(body.result.structuredContent.weather).toMatchObject({
    temperature: 58,
    conditions: 'Rainy',
    humidity: 85,
  });
});

it('tools/call returns protocol error for unknown tool', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/call', {
    name: 'nonexistent',
    arguments: {},
  });
  expect(body.error.code).toBe(-32602);
  expect(body.error.message).toContain('Unknown tool');
});

it('mutation tool executes and returns structured data', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const withoutConfirmation = await mcpRequest(port, 'tools/call', {
    name: 'cancel_order',
    arguments: { orderId: 'ORD-123' },
  });
  expect(withoutConfirmation.result.isError).toBe(false);
  expect(withoutConfirmation.result.structuredContent.cancelOrder).toMatchObject(
    { success: false, message: 'Confirmation required' },
  );

  const withConfirmation = await mcpRequest(port, 'tools/call', {
    name: 'cancel_order',
    arguments: { orderId: 'ORD-123', confirmationId: 'CONF-456' },
  });
  expect(withConfirmation.result.isError).toBe(false);
  expect(withConfirmation.result.structuredContent.cancelOrder).toMatchObject({
    success: true,
    message: 'Order ORD-123 cancelled',
  });
});

it('file-based tool (operationName) works', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/call', {
    name: 'get_forecast',
    arguments: { location: 'London', days: 2 },
  });
  expect(body.result.isError).toBe(false);
  expect(body.result.structuredContent).toBeDefined();
  const forecast = body.result.structuredContent.forecast;
  expect(forecast).toHaveLength(2);
  expect(forecast[0].date).toBe('2026-01-01');
});

it('@mcpTool directive auto-registers tool from operations file', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/list');
  const quick = body.result.tools.find(
    (t: any) => t.name === 'quick_weather',
  );
  expect(quick).toBeDefined();
  expect(quick.description).toBe('Quick weather check');

  const callBody = await mcpRequest(port, 'tools/call', {
    name: 'quick_weather',
    arguments: { location: 'Tokyo' },
  });
  expect(callBody.result.isError).toBe(false);
});

it('description provider resolves tool description', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/list');
  const tool = body.result.tools.find(
    (t: any) => t.name === 'provider_weather',
  );
  expect(tool.description).toBe('Resolved: weather_description');
});

it('per-field description provider overrides input field description', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/list');
  const tool = body.result.tools.find(
    (t: any) => t.name === 'field_provider_weather',
  );
  expect(tool.inputSchema.properties.location.description).toBe(
    'Resolved: location_field_desc',
  );
});

it('argument alias renames input and de-aliases on call', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/list');
  const tool = body.result.tools.find(
    (t: any) => t.name === 'aliased_weather',
  );
  expect(tool.inputSchema.properties.city).toBeDefined();
  expect(tool.inputSchema.properties.location).toBeUndefined();
  expect(tool.inputSchema.required).toContain('city');

  const callBody = await mcpRequest(port, 'tools/call', {
    name: 'aliased_weather',
    arguments: { city: 'London' },
  });
  expect(callBody.result.isError).toBe(false);
});

it('output.path extracts subset of response data', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/call', {
    name: 'search_cities',
    arguments: { query: 'New York' },
  });
  expect(body.result.structuredContent).toEqual([
    { name: 'New York City', country: 'US', population: 100000 },
  ]);

  const listBody = await mcpRequest(port, 'tools/list');
  const tool = listBody.result.tools.find(
    (t: any) => t.name === 'search_cities',
  );
  expect(tool.outputSchema.type).toBe('array');
});

it('postprocess hook transforms tool result to text', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/call', {
    name: 'formatted_weather',
    arguments: { location: 'New York' },
  });
  expect(JSON.parse(body.result.content[0].text)).toBe('72F and Partly Cloudy');
  expect(body.result.structuredContent).toBeUndefined();
});

it('preprocess hook short-circuits execution', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/call', {
    name: 'gated_weather',
    arguments: { location: 'London' },
  });
  const data = JSON.parse(body.result.content[0].text);
  expect(data).toEqual({ needsConfirmation: true, location: 'London' });
});

it('@mcpDescription on variable resolves from provider', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/list');
  const tool = body.result.tools.find(
    (t: any) => t.name === 'weather_field_provider',
  );
  expect(tool).toBeDefined();
  expect(tool.inputSchema.properties.location.description).toBe(
    'Resolved: weather.location',
  );
});

it('@mcpDescription on selection field resolves from provider', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/list');
  const tool = body.result.tools.find(
    (t: any) => t.name === 'weather_field_provider',
  );
  expect(tool.outputSchema).toBeDefined();
  expect(
    tool.outputSchema.properties.forecast.items.properties.conditions
      .description,
  ).toBe('Resolved: forecast.conditions');
});

describe('resources', () => {
  it('resources/list returns configured resources', async () => {
    const { port, execute } = await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('weather')],
      },
    });
    await execute({ query: '{ __typename }' });

    const body = await mcpRequest(port, 'resources/list');
    expect(body.result.resources).toHaveLength(3);

    const guide = body.result.resources.find(
      (r: any) => r.uri === 'docs://agent-guide',
    );
    expect(guide).toMatchObject({
      name: 'agent-guide',
      title: 'Agent Guide',
      description: 'How agents work',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 0.9 },
    });
  });

  it('resources/read returns text content', async () => {
    const { port, execute } = await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('weather')],
      },
    });
    await execute({ query: '{ __typename }' });

    const body = await mcpRequest(port, 'resources/read', {
      uri: 'docs://agent-guide',
    });
    expect(body.result.contents).toEqual([
      {
        uri: 'docs://agent-guide',
        mimeType: 'text/markdown',
        text: '# Agent Guide\n\nAgents route requests based on intent.',
      },
    ]);
  });

  it('resources/read returns blob for binary resources', async () => {
    const { port, execute } = await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('weather')],
      },
    });
    await execute({ query: '{ __typename }' });

    const body = await mcpRequest(port, 'resources/read', {
      uri: 'files://icon.png',
    });
    expect(body.result.contents[0].mimeType).toBe('image/png');
    expect(body.result.contents[0].blob).toBeDefined();
  });

  it('resources/read returns error for unknown URI', async () => {
    const { port, execute } = await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('weather')],
      },
    });
    await execute({ query: '{ __typename }' });

    const body = await mcpRequest(port, 'resources/read', {
      uri: 'docs://nonexistent',
    });
    expect(body.error.code).toBe(-32002);
  });
});

describe('resource templates', () => {
  it('resources/templates/list returns templates', async () => {
    const { port, execute } = await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('weather')],
      },
    });
    await execute({ query: '{ __typename }' });

    const body = await mcpRequest(port, 'resources/templates/list');
    expect(body.result.resourceTemplates).toHaveLength(1);
    expect(body.result.resourceTemplates[0]).toMatchObject({
      uriTemplate: 'weather://{location}',
      name: 'Weather Data',
    });
  });

  it('resources/read resolves template and calls handler', async () => {
    const { port, execute } = await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('weather')],
      },
    });
    await execute({ query: '{ __typename }' });

    const body = await mcpRequest(port, 'resources/read', {
      uri: 'weather://London',
    });
    expect(body.result.contents[0].mimeType).toBe('application/json');
    const data = JSON.parse(body.result.contents[0].text);
    expect(data.location).toBe('London');
    expect(data.temperature).toBe(72);
  });
});

it('header forwarding from MCP to internal dispatch', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(
    port,
    'tools/call',
    { name: 'get_weather', arguments: { location: 'London' } },
    1,
    { Authorization: 'Bearer test-token', 'X-Custom-Header': 'custom-value' },
  );
  expect(body.result.isError).toBe(false);
  expect(body.result.structuredContent.weather.temperature).toBe(58);
});

it('tool annotations appear in tools/list', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/list');
  const tools = body.result.tools;

  const cancelOrder = tools.find((t: any) => t.name === 'cancel_order');
  expect(cancelOrder.annotations).toMatchObject({ destructiveHint: true });

  const getWeather = tools.find((t: any) => t.name === 'get_weather');
  expect(getWeather.annotations).toMatchObject({ readOnlyHint: true });
});

it('content annotations are included in tool call response', async () => {
  const { port, execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('weather')],
    },
  });
  await execute({ query: '{ __typename }' });

  const body = await mcpRequest(port, 'tools/call', {
    name: 'get_weather',
    arguments: { location: 'London' },
  });
  expect(body.result.isError).toBe(false);
  expect(body.result.content[0].annotations).toMatchObject({
    audience: ['user', 'assistant'],
    priority: 0.7,
  });
});

