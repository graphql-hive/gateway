// Step 13: Dynamic resources with URI templates and handlers.
//
// Resource templates define parameterized URIs (e.g. weather://{location}).
// When an MCP client requests resources/read with a matching URI, the handler
// is called with the extracted parameters and returns dynamic content.
//
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"resources/templates/list","params":{}}' | jq '.result.resourceTemplates[] | {uriTemplate, name}'
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"weather://tokyo"}}' | jq '.result.contents[0]'
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"forecast://london/3"}}' | jq '.result.contents[0]'

import { createServer } from 'node:http';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { useMCP } from '@graphql-hive/plugin-mcp';
import { createSchema, createYoga } from 'graphql-yoga';

const weatherData: Record<
  string,
  { temperature: number; conditions: string; humidity: number }
> = {
  'new york': { temperature: 72, conditions: 'Partly Cloudy', humidity: 65 },
  london: { temperature: 58, conditions: 'Rainy', humidity: 85 },
  tokyo: { temperature: 68, conditions: 'Sunny', humidity: 55 },
  sydney: { temperature: 82, conditions: 'Clear', humidity: 45 },
  paris: { temperature: 63, conditions: 'Overcast', humidity: 70 },
};

const mcpOptions = {
  name: 'weather-api',
  version: '1.0.0',
  tools: [
    {
      name: 'get_weather',
      source: {
        type: 'inline',
        query: `query GetWeather($location: String!) {
          weather(location: $location) { temperature conditions humidity location }
        }`,
      },
    },
  ],
  // NEW: Resource templates with URI patterns and handlers
  resourceTemplates: [
    // Single-parameter template: weather://{location}
    {
      uriTemplate: 'weather://{location}',
      name: 'Weather Data',
      title: 'Weather by Location',
      description: 'Current weather data for any city, served as JSON',
      mimeType: 'application/json',
      handler: async (params: Record<string, string>) => {
        const location = params['location'] ?? 'unknown';
        const data = weatherData[location.toLowerCase()] || {
          temperature: 70,
          conditions: 'Unknown',
          humidity: 50,
        };
        return { text: JSON.stringify({ location, ...data }, null, 2) };
      },
    },
    // Multi-parameter template: forecast://{location}/{days}
    // Handler can override mimeType per response
    {
      uriTemplate: 'forecast://{location}/{days}',
      name: 'Forecast',
      description: 'Multi-day forecast as markdown',
      handler: async (params: Record<string, string>) => {
        const days = parseInt(params['days'] ?? '5', 10) || 5;
        const location = params['location'] ?? 'unknown';
        const conditions = [
          'Sunny',
          'Partly Cloudy',
          'Cloudy',
          'Rainy',
          'Clear',
        ];
        const lines = [`# ${days}-Day Forecast for ${location}`, ''];
        for (let i = 0; i < days; i++) {
          const cond =
            conditions[Math.floor(Math.random() * conditions.length)];
          lines.push(
            `- Day ${i + 1}: ${Math.round(60 + Math.random() * 20)}°F, ${cond}`,
          );
        }
        // Handler overrides mimeType to text/markdown (template default would be text/plain)
        return { text: lines.join('\n'), mimeType: 'text/markdown' };
      },
    },
  ],
};

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      weather("City name" location: String!): Weather!
    }
    type Weather {
      temperature: Float!
      conditions: String!
      humidity: Int!
      location: String!
    }
  `,
  resolvers: {
    Query: {
      weather: (_: unknown, { location }: { location: string }) => {
        const data = weatherData[location.toLowerCase()] || {
          temperature: 70,
          conditions: 'Unknown',
          humidity: 50,
        };
        return { ...data, location };
      },
    },
  },
});

const subgraphYoga = createYoga({ schema });
const subgraphServer = createServer(subgraphYoga);
subgraphServer.listen(4001, () => {
  console.log('Subgraph running at http://localhost:4001/graphql');
});

const gateway = createGatewayRuntime({
  proxy: { endpoint: 'http://localhost:4001/graphql' },
  plugins: (ctx) => [useMCP(ctx, mcpOptions)],
});

const gatewayServer = createServer(gateway);
gatewayServer.listen(4000, () => {
  console.log('Gateway running at http://localhost:4000/graphql');
  console.log('MCP endpoint at http://localhost:4000/mcp');
});
