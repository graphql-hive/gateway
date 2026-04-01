// Step 10: Rename input variables with aliases.
//
// GraphQL variable names often use camelCase or abbreviations ($q, $pageSize).
// Aliases let you expose friendlier names to MCP clients while keeping the GraphQL query unchanged.
// The MCP client sees 'city'; the plugin de-aliases it back to 'location' for GraphQL.
//
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[] | {name, inputSchema: .inputSchema.properties | keys}'
//
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_weather","arguments":{"city":"Tokyo"}}}' | jq '.result.structuredContent'

import { createServer } from 'node:http';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { useMCP, type MCPConfig } from '@graphql-hive/plugin-mcp';
import { createSchema, createYoga } from 'graphql-yoga';

const mcpOptions: MCPConfig = {
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
      tool: { title: 'Current Weather' },
      input: {
        schema: {
          properties: {
            // NEW: alias renames the input field for MCP clients
            // MCP client passes { city: "Tokyo" }; plugin sends $location = "Tokyo" to GraphQL
            location: {
              alias: 'city',
              description: 'City name, e.g. "Tokyo", "London"',
            },
          },
        },
      },
    },
    {
      name: 'get_forecast',
      source: {
        type: 'inline',
        query: `query GetForecast($location: String!, $days: Int = 5) {
          forecast(location: $location, days: $days) { date high low conditions }
        }`,
      },
      input: {
        schema: {
          properties: {
            location: {
              alias: 'city',
              description: 'City name',
            },
            days: {
              alias: 'numberOfDays',
              description: 'How many days to forecast',
              default: 5,
            },
          },
        },
      },
    },
  ],
};

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

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      weather("City name" location: String!): Weather!
      forecast(
        "City name"
        location: String!
        "Number of days"
        days: Int = 5
      ): [ForecastDay!]!
    }
    type Weather {
      temperature: Float!
      conditions: String!
      humidity: Int!
      location: String!
    }
    type ForecastDay {
      date: String!
      high: Float!
      low: Float!
      conditions: String!
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
      forecast: (
        _: unknown,
        { days = 5 }: { location: string; days?: number },
      ) => {
        const conditions = [
          'Sunny',
          'Partly Cloudy',
          'Cloudy',
          'Rainy',
          'Clear',
        ];
        return Array.from({ length: days }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() + i);
          return {
            date: date.toISOString().split('T')[0],
            high: Math.round(65 + Math.random() * 20),
            low: Math.round(45 + Math.random() * 15),
            conditions:
              conditions[Math.floor(Math.random() * conditions.length)],
          };
        });
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
