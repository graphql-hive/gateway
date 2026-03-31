// Step 3: Load tools from a .graphql operations file.
//
// Instead of inlining every query, point to a shared .graphql file with operationsPath. 
// Tools reference named operations by name and type.
// The get_forecast tool now loads from operations/weather.graphql.
//
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[] | {name, description}'
//
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_forecast","arguments":{"location":"Tokyo","days":3}}}' | jq '.result.structuredContent'
//
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_weather","arguments":{"location":"Tokyo"}}}' | jq '.result.structuredContent'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createYoga, createSchema } from 'graphql-yoga'
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime'
import { useMCP } from '@graphql-hive/plugin-mcp'

const mcpOptions = {
  name: 'weather-api',
  version: '1.0.0',
  // NEW: Load operations from a .graphql file
  operationsPath: join(dirname(dirname(fileURLToPath(import.meta.url))), 'operations/weather.graphql'),
  tools: [
    // Inline source (from step 2)
    {
      name: 'get_weather',
      source: {
        type: 'inline',
        // We removed conditions here to show that inline can have more priority
        query: `query GetWeather($location: String!) {
          weather(location: $location) {
            temperature
            humidity
            location
          }
        }`,
      },
    },
    // NEW: references a named operation from the .graphql file
    {
      name: 'get_forecast',
      source: {
        type: 'graphql',
        operationName: 'GetForecast',
        operationType: 'query',
      },
    },
  ],
}

const weatherData: Record<string, { temperature: number; conditions: string; humidity: number }> = {
  'new york': { temperature: 72, conditions: 'Partly Cloudy', humidity: 65 },
  'london': { temperature: 58, conditions: 'Rainy', humidity: 85 },
  'tokyo': { temperature: 68, conditions: 'Sunny', humidity: 55 },
  'sydney': { temperature: 82, conditions: 'Clear', humidity: 45 },
  'paris': { temperature: 63, conditions: 'Overcast', humidity: 70 },
}

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      "Get current weather data for a location"
      weather(
        "City name or postal code"
        location: String!
      ): Weather!

      "Get weather forecast for upcoming days"
      forecast(
        "City name or postal code"
        location: String!

        "Number of days to forecast (default 5)"
        days: Int = 5
      ): [ForecastDay!]!
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

    type ForecastDay {
      "Date in YYYY-MM-DD format"
      date: String!

      "High temperature in Fahrenheit"
      high: Float!

      "Low temperature in Fahrenheit"
      low: Float!

      "Expected weather conditions"
      conditions: String!
    }
  `,
  resolvers: {
    Query: {
      weather: (_, { location }: { location: string }) => {
        const loc = location.toLowerCase()
        const data = weatherData[loc] || { temperature: 70, conditions: 'Unknown', humidity: 50 }
        return { ...data, location }
      },
      forecast: (_, { days = 5 }: { location: string; days?: number }) => {
        const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Clear']
        const result = []
        const today = new Date()
        for (let i = 0; i < days; i++) {
          const date = new Date(today)
          date.setDate(date.getDate() + i)
          result.push({
            date: date.toISOString().split('T')[0],
            high: Math.round(65 + Math.random() * 20),
            low: Math.round(45 + Math.random() * 15),
            conditions: conditions[Math.floor(Math.random() * conditions.length)],
          })
        }
        return result
      },
    },
  },
})

const subgraphYoga = createYoga({ schema })
const subgraphServer = createServer(subgraphYoga)
subgraphServer.listen(4001, () => {
  console.log('Subgraph running at http://localhost:4001/graphql')
})

const gateway = createGatewayRuntime({
  proxy: {
    endpoint: 'http://localhost:4001/graphql',
  },
  plugins: (ctx) => [useMCP(ctx, mcpOptions)],
})

const gatewayServer = createServer(gateway)
gatewayServer.listen(4000, () => {
  console.log('Gateway running at http://localhost:4000/graphql')
  console.log('MCP endpoint at http://localhost:4000/mcp')
})
