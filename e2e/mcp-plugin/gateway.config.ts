import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@graphql-hive/gateway';
import { type MCPConfig, useMCP } from '@graphql-hive/plugin-mcp';

const mockProvider = {
  fetchDescription: (_toolName: string, config: Record<string, unknown>) =>
    `Resolved: ${config['prompt']}`,
};

const mcpConfig: MCPConfig = {
  name: 'mcp-e2e-gateway',
  version: '1.0.0',
  title: 'MCP E2E Test Gateway',
  description: 'Gateway for e2e testing of MCP features',

  operationsPath: resolve(
    dirname(fileURLToPath(import.meta.url)),
    'operations',
  ),

  providers: {
    mock: mockProvider,
  },

  tools: [
    // Inline tool, basic
    {
      name: 'get_weather',
      source: {
        type: 'inline',
        query: `query GetWeather($location: String!) {
            weather(location: $location) {
              temperature
              conditions
              humidity
            }
          }`,
      },
      tool: {
        title: 'Current Weather',
        annotations: { readOnlyHint: true },
      },
      output: {
        contentAnnotations: {
          audience: ['user', 'assistant'],
          priority: 0.7,
        },
      },
    },
    // File-based tool via operationName
    {
      name: 'get_forecast',
      source: {
        type: 'graphql',
        operationName: 'GetForecast',
        operationType: 'query',
      },
    },
    // Inline tool with description provider
    {
      name: 'provider_weather',
      source: {
        type: 'inline',
        query: `query($location: String!) {
            weather(location: $location) { temperature conditions }
          }`,
      },
      tool: {
        descriptionProvider: {
          type: 'mock',
          prompt: 'weather_description',
        },
      },
    },
    // Inline tool with input alias
    {
      name: 'aliased_weather',
      source: {
        type: 'inline',
        query: `query($location: String!) {
            weather(location: $location) { temperature conditions }
          }`,
      },
      tool: { description: 'Weather by city' },
      input: {
        schema: {
          properties: {
            location: {
              alias: 'city',
              description: 'City name to check weather for',
            },
          },
        },
      },
    },
    // Inline tool with output.path
    {
      name: 'search_cities',
      source: {
        type: 'inline',
        query: `query SearchCities($query: String!) {
            cities(query: $query) { name country population }
          }`,
      },
      tool: { description: 'Search cities' },
      output: { path: 'cities' },
    },
    // Inline tool with per-field description provider
    {
      name: 'field_provider_weather',
      source: {
        type: 'inline',
        query: `query($location: String!) {
            weather(location: $location) { temperature }
          }`,
      },
      tool: { description: 'Weather with field descriptions' },
      input: {
        schema: {
          properties: {
            location: {
              descriptionProvider: {
                type: 'mock',
                prompt: 'location_field_desc',
              },
            },
          },
        },
      },
    },
    // Inline tool with postprocess hook
    {
      name: 'formatted_weather',
      source: {
        type: 'inline',
        query: `query($location: String!) {
            weather(location: $location) { temperature conditions }
          }`,
      },
      hooks: {
        postprocess: (result: unknown) => {
          const data = result as {
            weather: { temperature: number; conditions: string };
          };
          return `${data.weather.temperature}F and ${data.weather.conditions}`;
        },
      },
    },
    // Inline tool with preprocess hook (short-circuit)
    {
      name: 'gated_weather',
      source: {
        type: 'inline',
        query: `query($location: String!) {
            weather(location: $location) { temperature }
          }`,
      },
      hooks: {
        preprocess: (args: Record<string, unknown>) => {
          if (!args['_confirmed']) {
            return {
              needsConfirmation: true,
              location: args['location'],
            };
          }
          return undefined;
        },
      },
    },
    // Mutation tool
    {
      name: 'cancel_order',
      source: {
        type: 'inline',
        query: `mutation CancelOrder($orderId: String!, $confirmationId: String) {
            cancelOrder(orderId: $orderId, confirmationId: $confirmationId) {
              success
              message
            }
          }`,
      },
      tool: {
        description: 'Cancel an order',
        annotations: { destructiveHint: true },
      },
    },
  ],

  resources: [
    {
      name: 'agent-guide',
      uri: 'docs://agent-guide',
      title: 'Agent Guide',
      description: 'How agents work',
      mimeType: 'text/markdown',
      text: '# Agent Guide\n\nAgents route requests based on intent.',
      annotations: { audience: ['assistant'], priority: 0.9 },
    },
    {
      name: 'api-reference',
      uri: 'docs://api-reference',
      text: 'GET /health - Health check endpoint',
    },
    {
      name: 'icon',
      uri: 'files://icon.png',
      mimeType: 'image/png',
      blob: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
    },
  ],

  resourceTemplates: [
    {
      uriTemplate: 'weather://{location}',
      name: 'Weather Data',
      title: 'Weather by Location',
      description: 'Get weather data as a resource',
      mimeType: 'application/json',
      handler: async (params: Record<string, string>) => ({
        text: JSON.stringify({
          location: params['location'],
          temperature: 72,
        }),
      }),
    },
  ],
};

export const gatewayConfig = defineConfig({
  plugins: (ctx) => [useMCP(ctx, mcpConfig)],
});
