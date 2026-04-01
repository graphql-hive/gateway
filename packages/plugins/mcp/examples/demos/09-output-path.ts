// Step 9: Extract nested values with output.path.
//
// By default, a tool returns the full GraphQL response: { weather: { temperature: 72, conditions: "Sunny", ... } }
// With output.path, you can extract a nested value so the tool returns just "Sunny" or just the inner object.
// The outputSchema in tools/list is also narrowed to match.
//
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[] | {name, outputSchema}'
//
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_conditions","arguments":{"location":"Tokyo"}}}' | jq '.result'

import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { useMCP } from '@graphql-hive/plugin-mcp';
import { createSchema, createYoga } from 'graphql-yoga';

const exampleDir = dirname(dirname(fileURLToPath(import.meta.url)));

const mcpOptions = {
  name: 'weather-api',
  version: '1.0.0',
  operationsPath: join(exampleDir, 'operations/weather.graphql'),
  tools: [
    // No output.path: returns full response { weather: { temperature, conditions, ... } }
    {
      name: 'get_weather',
      source: {
        type: 'inline',
        query: `query GetWeather($location: String!) {
          weather(location: $location) {
            temperature
            conditions
            humidity
            location
          }
        }`,
      },
    },
    // NEW: output.path extracts a string value
    // Without path: { weather: { conditions: "Sunny" } }
    // With path 'weather.conditions': "Sunny"
    {
      name: 'get_conditions',
      source: {
        type: 'inline',
        query: `query GetConditions($location: String!) {
          weather(location: $location) {
            conditions
          }
        }`,
      },
      tool: {
        title: 'Weather Conditions',
        description: 'Get just the weather conditions string for a city',
      },
      output: { path: 'weather.conditions' },
    },
    // NEW: output.path extracts an object
    // Without path: { weather: { temperature: 72, humidity: 65 } }
    // With path 'weather': { temperature: 72, humidity: 65 }
    {
      name: 'get_weather_data',
      source: {
        type: 'inline',
        query: `query GetWeatherData($location: String!) {
          weather(location: $location) {
            temperature
            humidity
          }
        }`,
      },
      tool: { description: 'Get temperature and humidity as a flat object' },
      output: { path: 'weather' },
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
      "Get current weather data for a location"
      weather("City name or postal code" location: String!): Weather!
    }
    type Weather {
      "Temperature in Fahrenheit"
      temperature: Float!
      "Current weather conditions"
      conditions: String!
      "Humidity percentage"
      humidity: Int!
      "Location name"
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
