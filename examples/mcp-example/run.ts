import { createServer } from 'node:http'
import { createYoga, createSchema } from 'graphql-yoga'
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime'
import { useMCP } from '@graphql-hive/plugin-mcp'

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
      forecast: (_, { location, days = 5 }: { location: string; days?: number }) => {
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

const mcpPlugin = useMCP({
  name: 'weather-api',
  version: '1.0.0',
  path: '/mcp',
  operationsPath: './operations/weather.graphql',
  tools: [
    {
      name: 'get_weather',
      source: { type: 'graphql', operationName: 'GetWeather', operationType: 'query' },
      tool: {
        title: 'Current Weather',
        description: 'Get the current weather for a city',
      },
      input: {
        schema: {
          properties: {
            location: { description: 'City name, e.g. "New York", "London", "Tokyo"' },
          },
        },
      },
    },
    {
      name: 'get_forecast',
      source: { type: 'graphql', operationName: 'GetForecast', operationType: 'query' },
    },
  ],
})

const gateway = createGatewayRuntime({
  proxy: {
    endpoint: 'http://localhost:4001/graphql',
  },
  plugins: () => [mcpPlugin],
})

const gatewayServer = createServer(gateway)
gatewayServer.listen(4000, () => {
  console.log('Gateway running at http://localhost:4000/graphql')
  console.log('MCP endpoint at http://localhost:4000/mcp')
})
